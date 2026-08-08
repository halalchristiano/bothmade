/**
 * A database shaped to this round's two bugs, so the screenshots show the
 * real pages rather than a mock of them.
 *
 * The launch-gate project is the whole point: Havisham is confirmed Ready for
 * Launch — the act Section 1 defines the phrase as — while its stage is still
 * Build, because moving the stage is a separate act that emails the client
 * again. That is the ordinary order of events, and it was the shape the old
 * gate refused to bill.
 *
 * Run with: npx tsx scripts/screenshots/seed-delivery.ts
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const day = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * day);

async function main() {
  // Physical table names — the models are @@map'd to snake_case plurals, and
  // truncating "User" silently does nothing at all.
  // rate_limits too: a handful of runs in a row trips the login limiter, and
  // a screenshot script that cannot sign in on its fourth go is a screenshot
  // script nobody runs.
  for (const table of ['instalments', 'project_updates', 'project_messages', 'payments', 'projects', 'clients', 'users', 'rate_limits']) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`).catch(() => {});
  }

  await prisma.user.create({
    data: {
      email: 'kiana@bothmade.studio',
      password: await bcrypt.hash('screenshot-only', 10),
      name: 'Kiana',
      role: 'owner',
    },
  });

  /* ---- The launch gate ------------------------------------------------ */
  const havisham = await prisma.client.create({
    data: {
      email: 'ruth@havisham.co.uk',
      password: await bcrypt.hash('screenshot-only', 10),
      company: 'Havisham Joinery',
      contactName: 'Ruth Havisham',
    },
  });

  const havishamProject = await prisma.project.create({
    data: {
      clientId: havisham.id,
      name: 'Havisham Joinery — Custom Website',
      baseService: 'custom',
      // Still Build. Nobody has moved the dropdown, because moving it emails
      // the client a second time — and the confirmation below is the act the
      // contract actually names.
      status: 'build',
      statusStage: 2,
      totalPrice: 600_000,
      basePrice: 600_000,
      // Section 1: "confirmed in writing through the dashboard".
      readyForLaunchAt: ago(2),
      domainName: 'havisham.co.uk',
      domainAccess: 'we-control',
      hostingProvider: 'Vercel',
      launchChecklist: Object.fromEntries(
        [
          'domain-reachable', 'dns-ready', 'ssl', 'redirects', 'content-final',
          'forms', 'devices', 'analytics', 'seo', 'performance', 'backup',
          'handover-pack', 'client-walkthrough',
        ].map((k) => [k, { done: true, at: ago(2).toISOString(), by: 'Kiana' }])
      ),
      updatedAt: ago(1),
    },
  });

  await prisma.instalment.createMany({
    data: [
      { projectId: havishamProject.id, index: 1, count: 3, label: 'Payment 1 of 3', percent: 40, amountCents: 240_000, trigger: 'signing', status: 'paid', paidAt: ago(40) },
      { projectId: havishamProject.id, index: 2, count: 3, label: 'Payment 2 of 3', percent: 30, amountCents: 180_000, trigger: 'design-approval', status: 'paid', paidAt: ago(15) },
      // The one the old gate refused.
      { projectId: havishamProject.id, index: 3, count: 3, label: 'Payment 3 of 3', percent: 30, amountCents: 180_000, trigger: 'ready-for-launch', status: 'scheduled' },
    ],
  });

  await prisma.payment.createMany({
    data: [
      { projectId: havishamProject.id, amount: 240_000, type: 'deposit', createdAt: ago(40) },
      { projectId: havishamProject.id, amount: 180_000, type: 'balance', createdAt: ago(15) },
    ],
  });

  /* ---- A row to snooze ------------------------------------------------ */
  const okafor = await prisma.client.create({
    data: {
      email: 'dana@okafor.co.uk',
      password: await bcrypt.hash('screenshot-only', 10),
      company: 'Okafor Plumbing',
      contactName: 'Dana Okafor',
    },
  });

  await prisma.project.create({
    data: {
      clientId: okafor.id,
      name: 'Okafor Plumbing Site',
      baseService: 'custom',
      status: 'design',
      statusStage: 1,
      totalPrice: 400_000,
      basePrice: 400_000,
      // Quiet for a fortnight — lands in the "gone quiet" band, which is the
      // band whose rows are worth putting down for a week.
      updatedAt: ago(14),
      handoffAcknowledgedAt: ago(30),
    },
  });

  console.log('SEEDED');
  console.log('havishamProjectId=' + havishamProject.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
