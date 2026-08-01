import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const client = await prisma.client.findUnique({
      where: { id: (await params).clientId },
      include: {
        projects: { orderBy: { createdAt: 'desc' } },
        emailPreferences: true,
      },
    });

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        client: {
          id: client.id,
          email: client.email,
          company: client.company,
          phone: client.phone,
          contactName: client.contactName,
          onboardingComplete: client.onboardingComplete,
          lastLoginAt: client.lastLoginAt,
          createdAt: client.createdAt,
          projects: client.projects,
          emailPreferences: client.emailPreferences,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get client error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { company, phone, contactName } = await request.json();

    const client = await prisma.client.update({
      where: { id: (await params).clientId },
      data: {
        company: company || undefined,
        phone: phone !== undefined ? phone : undefined,
        contactName: contactName !== undefined ? contactName : undefined,
      },
    });

    return NextResponse.json({ success: true, client }, { status: 200 });
  } catch (error) {
    console.error('Update client error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
