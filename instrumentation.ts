/**
 * Runs once per server instance, before the first request is served.
 *
 * The only job here is refusing to come up at all when a secret that has no
 * safe default is missing. A server that boots with an unset JWT_SECRET is
 * worse than a server that doesn't boot: it looks healthy while signing
 * sessions with a value published in this repo.
 */
export async function register() {
  // Edge instances don't handle auth here, and the Node instance is the one
  // that signs and verifies everything.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { assertBootSecrets } = await import('@/lib/env');
  assertBootSecrets();
}
