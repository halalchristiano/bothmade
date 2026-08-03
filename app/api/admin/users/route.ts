import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, generateRandomPassword } from '@/lib/auth';
import { forbiddenResponse, requireOwner, requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isUserRole } from '@/lib/roles';

/**
 * Team-member list. Any staff account can read it — assignment dropdowns
 * across the admin depend on it — but `role` is included now that there is a
 * page which shows and edits it.
 */
export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        title: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, users }, { status: 200 });
  } catch (error) {
    console.error('List users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Add a teammate. Owner-only, per the role split in lib/middleware.ts: staff
 * share the admin surface, and the exceptions are the actions where `sales`
 * is deliberately constrained. Deciding who else gets an account is one.
 *
 * Returns the generated password once, in this response and nowhere else —
 * only a bcrypt hash is stored, so if it isn't handed over now the account
 * needs a reset instead.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireOwner();
    if (!session) return forbiddenResponse('Only an owner can add a teammate.');

    const { name, email, role, title, password } = await request.json();

    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!isUserRole(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return NextResponse.json(
        { error: 'Someone already has that email address.' },
        { status: 409 }
      );
    }

    // A caller-supplied password is honoured, otherwise one is generated and
    // shown once. Either way only the hash is stored.
    const initialPassword =
      typeof password === 'string' && password.length >= 8 ? password : generateRandomPassword();

    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        name: typeof name === 'string' && name.trim() ? name.trim() : null,
        title: typeof title === 'string' && title.trim() ? title.trim() : null,
        role,
        password: await hashPassword(initialPassword),
      },
      select: { id: true, name: true, email: true, role: true, title: true, createdAt: true },
    });

    return NextResponse.json({ success: true, user, initialPassword }, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
