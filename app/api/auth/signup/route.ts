import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, setAuthCookie, createToken } from '@/lib/auth';

/**
 * First-run bootstrap: creates the very first staff account, and nothing else.
 *
 * This route used to be open to the internet and hardcoded `role: 'admin'`, so
 * anyone who found the URL could POST an email and a password and be looking
 * at the full admin dashboard a second later — every client, lead, invoice,
 * uploaded file, and internal note. No UI ever called it; it existed only as a
 * way in.
 *
 * It is kept rather than deleted because a fresh database still needs some way
 * to create its first user, but it is now closed by two independent gates:
 *
 *   1. It works only while the User table is empty. The moment one staff
 *      account exists this endpoint is permanently shut, and every request
 *      gets the same 404 an unknown path would.
 *   2. If ADMIN_BOOTSTRAP_TOKEN is set it must also be presented, which closes
 *      the short window on a freshly deployed, not-yet-seeded database.
 *
 * After the first account, staff are added from inside the admin area by
 * someone already signed in.
 */

const MIN_PASSWORD_LENGTH = 12;

/** One response for every refusal — a prober learns nothing from the shape. */
function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(request: NextRequest) {
  try {
    // Gate 1: only ever available on an empty User table.
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      console.warn('[auth] signup attempted after bootstrap — refused');
      return notFound();
    }

    // Gate 2: optional shared secret, for the window before the first seed.
    const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
    if (bootstrapToken) {
      const provided = request.headers.get('x-bootstrap-token') ?? '';
      if (provided !== bootstrapToken) {
        console.warn('[auth] signup attempted with a bad bootstrap token');
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

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        // The first account is the owner — the person setting the studio up.
        // Any other role is a decision for someone already signed in to make.
        role: role === 'owner' || role === 'admin' ? role : 'owner',
      },
    });

    const token = createToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      type: 'user',
    });

    await setAuthCookie(token);

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
