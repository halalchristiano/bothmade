import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, getCurrentSession } from '@/lib/auth';

// Roles a team member may be assigned. Anything else falls back to "admin".
const ALLOWED_ROLES = ['owner', 'sales', 'admin'] as const;

/**
 * Create a Bothmade team member.
 *
 * This used to be open, unauthenticated public self-registration that minted a
 * full `role: 'admin'` account and logged the caller straight in — i.e. anyone
 * on the internet could grant themselves the entire back office. It is now an
 * admin action: an existing staff session is required, and creating the new
 * user no longer swaps the caller's own session. The very first user is seeded
 * directly in the database, so there is no bootstrap gap.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, password, name, role } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const assignedRole =
      typeof role === 'string' && (ALLOWED_ROLES as readonly string[]).includes(role)
        ? role
        : 'admin';

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: assignedRole,
      },
    });

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
