import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, generateRandomPassword } from '@/lib/auth';
import { forbiddenResponse, requireOwner, requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isUserRole } from '@/lib/roles';
import { FIELD_LIMITS, isValidEmail } from '@/lib/validation';

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
        // Which mailbox this account sends from, and whether it still can.
        // The team list is where somebody asks "why aren't the automated
        // follow-ups going out" — and until now the answer lived on a
        // different page that only ever showed your own mailbox.
        gmailAddress: true,
        gmailConnectedAt: true,
        gmailNeedsReconnect: true,
        // Never the secret itself — only whether one is there. Both columns
        // hold encrypted values and neither has any business leaving the
        // server.
        gmailAppPassword: true,
        googleRefreshToken: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(
      {
        success: true,
        users: users.map(({ gmailAppPassword, googleRefreshToken, ...user }) => ({
          ...user,
          mailbox: {
            address: user.gmailAddress,
            connectedAt: user.gmailConnectedAt,
            needsReconnect: user.gmailNeedsReconnect,
            /** Same predicate lib/outreach-health.ts sends by. */
            canSend: Boolean(gmailAppPassword || googleRefreshToken),
          },
        })),
      },
      { status: 200 }
    );
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
    /*
     * The one field on this form that has to be right.
     *
     * Any non-empty string used to pass. That is worse here than on a public
     * form, because there is no second chance: the password is generated,
     * shown once in this response and stored only as a hash, so an address
     * with a typo in it produces an account that cannot be signed into and
     * cannot be recovered either — a reset mail goes to a mailbox that does
     * not exist. The row then sits in the team list looking like a colleague.
     *
     * The same predicate the public forms use, so an address the contact form
     * would have refused is not one an owner can create a login with.
     */
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'That does not look like an email address.' },
        { status: 400 }
      );
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
        // Capped the same way Settings caps them when somebody edits their
        // own — the fields are the same fields whichever page writes them.
        name: typeof name === 'string' && name.trim() ? name.trim().slice(0, FIELD_LIMITS.name) : null,
        title: typeof title === 'string' && title.trim() ? title.trim().slice(0, FIELD_LIMITS.title) : null,
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
