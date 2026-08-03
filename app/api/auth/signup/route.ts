import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { requireOwner, forbiddenResponse } from '@/lib/middleware';
import { checkPasswordStrength } from '@/lib/password-policy';
import { RATE_LIMITS, clientIp, enforceRateLimit } from '@/lib/rate-limit';

/**
 * Create a Bothmade team member.
 *
 * This route used to be open to the internet and minted `role: 'admin'`
 * accounts with a cookie already set — anyone who found the URL could POST
 * an email and a password and land inside the CRM with every lead, every
 * client, and every contract. That was the single worst thing in this
 * codebase; there is no version of a public self-serve endpoint on an
 * internal admin tool that is correct.
 *
 * It is now two things and nothing else:
 *
 *  1. An owner-only way to add a teammate. Sales can't create accounts —
 *     account creation is how a limited role escalates itself.
 *  2. A first-run bootstrap for a brand-new deployment with an empty User
 *     table, guarded by ADMIN_BOOTSTRAP_TOKEN. Leave that env var unset and
 *     the path doesn't exist. It closes permanently the moment the first
 *     account exists.
 *
 * Neither path sets an auth cookie. Creating an account is not logging in.
 */

const VALID_ROLES = new Set(['owner', 'sales', 'admin']);

function bootstrapTokenMatches(provided: string | null): boolean {
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN?.trim();
  if (!expected || !provided) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(
    request,
    'signup',
    RATE_LIMITS.signup,
    'Too many sign-up attempts. Please wait and try again.'
  );
  if (limited) return limited;

  try {
    // Authorization is decided before the body is even read. An
    // unauthenticated caller should not be able to reach the JSON parser,
    // let alone hand it something malformed and get a 500 with a stack
    // trace out of it — on the one endpoint that creates admin accounts,
    // "who are you" is the first question, not the fourth.
    const owner = await requireOwner();
    let authorized = owner !== null;

    if (!authorized) {
      // Bootstrap: only with the token, and only into an empty User table.
      const userCount = await prisma.user.count();
      if (userCount === 0 && bootstrapTokenMatches(request.headers.get('x-bootstrap-token'))) {
        authorized = true;
      }
    }

    if (!authorized) {
      console.warn(`[auth] Rejected account-creation attempt from ${clientIp(request)}`);
      return forbiddenResponse('Accounts are created by an owner.');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }

    const { email, password, name, role: requestedRole } = (body ?? {}) as Record<string, unknown>;

    if (
      typeof email !== 'string' ||
      typeof name !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !name.trim()
    ) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const strength = checkPasswordStrength(password, normalizedEmail);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.error }, { status: 400 });
    }

    // An owner can pick the new account's role; bootstrap always makes an
    // owner, since a deployment whose only account can't add teammates is
    // a deployment nobody can finish setting up.
    const role = owner
      ? typeof requestedRole === 'string' && VALID_ROLES.has(requestedRole)
        ? requestedRole
        : 'sales'
      : 'owner';

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name: name.trim(),
        role,
      },
    });

    return NextResponse.json(
      {
        success: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
