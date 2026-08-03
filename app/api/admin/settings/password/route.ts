import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { createToken, hashPassword, setAuthCookie, verifyPassword } from '@/lib/auth';
import { checkPasswordStrength } from '@/lib/password-policy';

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 });
    }

    const strength = checkPasswordStrength(newPassword, session.email);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.error }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return unauthorizedResponse();

    const valid = await verifyPassword(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    const hashed = await hashPassword(newPassword);
    // Changing a password is how someone reacts to believing a session was
    // stolen, so it has to actually evict the other sessions: the watermark
    // refuses every token minted before now, for the rest of its 7 days.
    await prisma.user.update({
      where: { id: session.userId },
      data: { password: hashed, sessionsValidFrom: new Date() },
    });

    // ...including the one that made this request. Re-issue it, so the person
    // who just secured their account stays signed in while everyone else is
    // dropped. Minted after the update, so its `iat` clears the watermark.
    await setAuthCookie(
      createToken({
        userId: session.userId,
        email: session.email,
        role: session.role,
        type: 'user',
      })
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
