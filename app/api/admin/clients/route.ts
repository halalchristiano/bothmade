import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession();

    if (!session || session.type !== 'user') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const clients = await prisma.client.findMany({
      include: {
        projects: true,
        emailPreferences: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter sensitive data
    const safeClients = clients.map((client) => ({
      id: client.id,
      email: client.email,
      company: client.company,
      phone: client.phone,
      contactName: client.contactName,
      subscription: client.subscription,
      subscriptionTier: client.subscriptionTier,
      onboardingComplete: client.onboardingComplete,
      createdAt: client.createdAt,
      projects: client.projects,
    }));

    return NextResponse.json(
      { success: true, clients: safeClients },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get clients error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
