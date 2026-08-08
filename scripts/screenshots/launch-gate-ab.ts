/**
 * The launch gate, A/B against one real project on a real server.
 *
 * Nothing changes between the two calls except `readyForLaunchAt` — the same
 * project, the same stage (Build), the same Payment 3, the same request. The
 * only difference is whether the confirmation Section 1 defines has been
 * made, which is exactly the difference the old gate could not see.
 *
 *   npx tsx scripts/screenshots/launch-gate-ab.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = process.env.BOTHMADE_BASE ?? 'http://localhost:3100';

async function signIn(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'kiana@bothmade.studio', password: 'screenshot-only' }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  if (!res.ok || !cookie) throw new Error(`login failed: ${res.status}`);
  return cookie;
}

async function trySendPayment3(cookie: string, projectId: string) {
  const res = await fetch(`${BASE}/api/admin/projects/${projectId}/instalments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ index: 3 }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const cookie = await signIn();
  const project = await prisma.project.findFirst({
    where: { name: { startsWith: 'Havisham' } },
    select: { id: true, status: true, statusStage: true, readyForLaunchAt: true },
  });
  if (!project) throw new Error('seed first: npx tsx scripts/screenshots/seed-delivery.ts');

  const confirmedAt = project.readyForLaunchAt;
  console.log(`Project is at ${project.status} (stage ${project.statusStage}) in both runs.\n`);

  // A — the confirmation withdrawn. Nothing else touched.
  await prisma.project.update({ where: { id: project.id }, data: { readyForLaunchAt: null } });
  const before = await trySendPayment3(cookie, project.id);
  console.log('A — not confirmed ready for launch');
  console.log(`   HTTP ${before.status}  gateNotReached=${before.body.gateNotReached === true}`);
  console.log(`   ${before.body.error ?? '(no error)'}\n`);

  // B — the confirmation restored. Same request, same stage.
  await prisma.project.update({
    where: { id: project.id },
    data: { readyForLaunchAt: confirmedAt ?? new Date() },
  });
  const after = await trySendPayment3(cookie, project.id);
  console.log('B — confirmed ready for launch on the launch board');
  console.log(`   HTTP ${after.status}  gateNotReached=${after.body.gateNotReached === true}`);
  if (after.status === 200) {
    console.log(
      `   invoice ${after.body.instalment?.invoiceNumber ?? '(number withheld)'} raised for ${after.body.instalment?.label ?? 'Payment 3'}`
    );
  } else if (after.body.gateNotReached === true) {
    console.log(`   STILL GATED — the fix did not take: ${after.body.error}`);
  } else {
    /*
     * Past the gate, which is the whole assertion. Locally the request then
     * dies at Stripe, because STRIPE_SECRET_KEY here is a placeholder and
     * raising the invoice mints a real Checkout Session. That is a different
     * failure from a different layer — "Invalid JSON received from the Stripe
     * API" in the server log — and reporting it as if the gate refused would
     * be the opposite of what happened.
     */
    console.log(`   past the gate (no gateNotReached), then HTTP ${after.status} from Stripe:`);
    console.log(`   ${after.body.error ?? '(no error)'} — local Stripe key is a placeholder`);
  }

  // Leave the schedule as the seed made it, so the page screenshots still show
  // Payment 3 unsent.
  await prisma.instalment.updateMany({
    where: { projectId: project.id, index: 3 },
    data: { status: 'scheduled', invoiceNumber: null, stripeSessionId: null, paymentUrl: null, invoicedAt: null, dueAt: null, emailSentAt: null },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
