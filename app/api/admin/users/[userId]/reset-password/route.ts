import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { forbiddenResponse, requireOwner } from '@/lib/middleware';
import { generateRandomPassword, hashPassword } from '@/lib/auth';
import { sendPasswordChangedEmail } from '@/lib/email';

/**
 * The way back in for a teammate who cannot sign in.
 *
 * There wasn't one. An account could be created, re-roled and deleted from
 * the Team page, and the initial password was shown exactly once — so a
 * teammate who lost it had no path back at all. The only workaround was to
 * delete the account and add it again, which is not a workaround: `Lead`
 * points at its owner with `onDelete: SetNull`, so it silently unassigns
 * every lead that person was working, and `TeamMessage` cascades, so it takes
 * their side of the team chat with it. For the last owner it is not even
 * available — `wouldOrphanTeam` refuses, correctly, which left the one
 * account that can fix everyone else's as the one account nothing could fix.
 *
 * The staff password-reset-by-email flow is the other route back, and it
 * depends on the person still reaching that mailbox. This is the case where
 * they don't: the address is a Workspace account they are locked out of, or
 * it is the one that was compromised.
 *
 * Same shape as adding someone — a generated password, shown once, only ever
 * stored hashed — because it is the same job, and the page already knows how
 * to display that safely.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await requireOwner();
    if (!session) return forbiddenResponse('Only an owner can reset a teammate’s password.');

    const { userId } = await params;

    /*
     * Not your own, even though you are allowed to change it.
     *
     * The watermark below refuses every token minted before now, including
     * the cookie making this request — so an owner resetting themselves here
     * would be signed out mid-click, holding a password they have not saved
     * anywhere yet. Settings does the same job and re-issues the cookie
     * afterwards, which is the difference that matters.
     */
    if (userId === session.userId) {
      return NextResponse.json(
        { error: 'Change your own password in Settings — it keeps you signed in.' },
        { status: 409 }
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!target) {
      return NextResponse.json({ error: 'No such team member' }, { status: 404 });
    }

    const initialPassword = generateRandomPassword();

    // The watermark is half the point. Resetting a password because an
    // account may be compromised does nothing if the stolen 7-day token keeps
    // working for the rest of the week — sessions are stateless JWTs, so this
    // column is the only thing that evicts them.
    await prisma.user.update({
      where: { id: target.id },
      data: { password: await hashPassword(initialPassword), sessionsValidFrom: new Date() },
    });

    // Told after the fact, and never in the way of the reset. This is the
    // notice that catches the case the whole feature is shaped around — an
    // owner reset that the account holder did not ask for.
    void sendPasswordChangedEmail({
      toEmail: target.email,
      via: 'owner',
      changedAtLabel:
        new Date().toLocaleString('en-US', {
          dateStyle: 'long',
          timeStyle: 'short',
          // UTC, spelled out, matching the other two places that send this
          // email — a security notice whose timestamp means something
          // different depending on which route sent it is a notice somebody
          // has to reconcile by hand.
          timeZone: 'UTC',
        }) + ' UTC',
    }).catch(() => false);

    return NextResponse.json(
      { success: true, email: target.email, initialPassword },
      { status: 200 }
    );
  } catch (error) {
    console.error('Reset teammate password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
