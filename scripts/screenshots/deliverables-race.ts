/**
 * The lost update, at the level it actually happens: two transactions doing
 * read-modify-write on one JSON column.
 *
 * Ten HTTP requests against a local database do not reproduce it — the gap
 * between the read and the write is microseconds. Between Vercel and Supabase
 * in us-east-1 it is milliseconds, and the gap is the whole bug. So this
 * widens it deliberately and shows the mechanism both ways.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function reset(id: string) {
  await prisma.project.update({ where: { id }, data: { deliverables: '[]' } });
}
async function read(id: string) {
  const p = await prisma.project.findUnique({ where: { id }, select: { deliverables: true } });
  return JSON.parse(p?.deliverables ?? '[]') as Array<{ name: string }>;
}

/** What both handlers used to do. */
async function addUnlocked(id: string, name: string, delay: number) {
  const list = await read(id);
  await sleep(delay);
  list.push({ name });
  await prisma.project.update({ where: { id }, data: { deliverables: JSON.stringify(list) } });
}

/** What they do now. */
async function addLocked(id: string, name: string, delay: number) {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ deliverables: string | null }>>`
      SELECT "deliverables" FROM "projects" WHERE "id" = ${id} FOR UPDATE`;
    const list = JSON.parse(rows[0]?.deliverables ?? '[]') as Array<{ name: string }>;
    await sleep(delay);
    list.push({ name });
    await tx.project.update({ where: { id }, data: { deliverables: JSON.stringify(list) } });
  });
}

async function main() {
  const p = await prisma.project.findFirst({ where: { name: { startsWith: 'Havisham' } }, select: { id: true } });
  if (!p) throw new Error('seed first');

  await reset(p.id);
  await Promise.all([addUnlocked(p.id, 'A.pdf', 150), addUnlocked(p.id, 'B.pdf', 10)]);
  const before = await read(p.id);
  console.log(`  WITHOUT the lock: ${before.length} of 2 survived — ${JSON.stringify(before.map((d) => d.name))}`);

  await reset(p.id);
  await Promise.all([addLocked(p.id, 'A.pdf', 150), addLocked(p.id, 'B.pdf', 10)]);
  const after = await read(p.id);
  console.log(`  WITH the lock:    ${after.length} of 2 survived — ${JSON.stringify(after.map((d) => d.name))}`);
}
main().finally(() => prisma.$disconnect());
