import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET() {
  try {
    const session = await getCurrentSession();

    if (!session) {
      return unauthorizedResponse();
    }

    if (session.type === 'client') {
      const client = await prisma.client.findUnique({
        where: { id: session.clientId },
      });

      // Deliberately not gated on mustChangePassword: this is the endpoint
      // the browser reads *to discover* it needs to change one. A
      // decommissioned account is a different matter — the 7-day JWT
      // outlives an offboarding, so re-check it here.
      if (!client || client.archivedAt) {
        return unauthorizedResponse();
      }

      return NextResponse.json(
        {
          success: true,
          type: 'client',
          client: {
            id: client.id,
            email: client.email,
            company: client.company,
            contactName: client.contactName,
            phone: client.phone,
            mustChangePassword: client.mustChangePassword,
          },
        },
        { status: 200 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      return unauthorizedResponse();
    }

    return NextResponse.json(
      {
        success: true,
        type: 'user',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get current session error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
