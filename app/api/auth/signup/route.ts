import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession, hashPassword, setAuthCookie, createToken } from '@/lib/auth';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';

/**
 * Creates a staff account.
 *
 * This route was open to the internet and hardcoded `role: 'admin'`, so
 * anyone who found the URL could POST an email and a password and be looking
 * at the full admin dashboard a second later — every client, lead, invoice,
 * uploaded file and internal note. No UI ever called it; it existed only as a
 * way in.
 *
 * It isn't deleted, because it is the only thing that can create the first
 * user on a fresh database, and the only way to add a colleague. Instead
 * there are now exactly two ways through:
 *
 *   1. **Bootstrap** — while the User table is empty. The moment one staff
 *      account exists this path closes for good. If ADMIN_BOOTSTRAP_TOKEN is
 *      set it must also be presented, covering the window between a database
 *      being created and its first account being made.
 *   2. **Invitation** — an owner or admin who is already signed in adds
 *      somebody. This is what keeps the endpoint useful day to day.
 *
 * Anything else gets the same 404 an unknown path would, so a prober cannot
 * tell this route from a typo.
 */

const MIN_PASSWORD_LENGTH = 12;

/** Roles a new account may be given — nothing outside this list is invented. */
const ASSIGNABLE_ROLES = ['owner', 'admin', 'sales'] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === 'string' && (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

/** One response for every refusal — the shape tells a prober nothing. */
function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(
      request,
      'signup',
      RATE_LIMITS.signup,
      'Too many sign-up attempts. Please wait and try again.'
    );
    if (limited) return limited;

    const existingUsers = await prisma.user.count();
    const isBootstrap = existingUsers === 0;

    if (isBootstrap) {
      // Optional shared secret, for the gap between "database exists" and
      // "first account made" on a URL that is already public.
      const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
      if (bootstrapToken && request.headers.get('x-bootstrap-token') !== bootstrapToken) {
        console.warn('[auth] bootstrap signup attempted with a bad token — refused');
        return notFound();
      }
    } else {
      // Past bootstrap this is an invitation, and needs a signed-in owner or
      // admin. Sales staff manage leads, not colleagues.
      const session = await getCurrentSession();
      const canInvite =
        session?.type === 'user' &&
        'role' in session &&
        (session.role === 'owner' || session.role === 'admin');

      if (!canInvite) {
        console.warn('[auth] unauthenticated signup attempt — refused');
        return notFound();
      }
    }

    const { email, password, name, role } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        // The first account is the owner — the person setting the studio up.
        // After that the inviter chooses, from the fixed list above.
        role: isBootstrap ? 'owner' : isAssignableRole(role) ? role : 'sales',
      },
    });

    // Only the bootstrap account signs itself in. Doing it for an invited
    // colleague would swap the inviter's own session for the new one.
    if (isBootstrap) {
      await setAuthCookie(
        createToken({ userId: user.id, email: user.email, role: user.role, type: 'user' })
      );
    }

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
