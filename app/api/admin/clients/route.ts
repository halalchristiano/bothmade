import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import type { Prisma } from '@prisma/client';
import { pageMeta, parsePageParams, searchFilter } from '@/lib/pagination';

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession();

    if (!session || session.type !== 'user') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const params = parsePageParams(searchParams);
    const search = searchFilter(searchParams.get('q'), [
      'company',
      'email',
      'contactName',
    ] as const);
    const where: Prisma.ClientWhereInput = { ...(search ?? {}) };

    const [total, clients] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        include: {
          projects: true,
          emailPreferences: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: params.skip,
        take: params.take,
      }),
    ]);

    // Health signal: days since the most recent activity (message or project
    // update) across any of the client's projects — lets Kiana spot clients
    // who've gone quiet at a glance.
    //
    // This used to run two queries per client inside a Promise.all over the
    // whole table: 2N+1, growing with every client signed. Two grouped
    // queries answer it for the entire page at once instead.
    const projectIds = clients.flatMap((c) => c.projects.map((p) => p.id));
    const projectToClient = new Map(
      clients.flatMap((c) => c.projects.map((p) => [p.id, c.id] as const))
    );

    const [messageMaxes, updateMaxes] = projectIds.length
      ? await Promise.all([
          prisma.projectMessage.groupBy({
            by: ['projectId'],
            where: { projectId: { in: projectIds } },
            _max: { createdAt: true },
          }),
          prisma.projectUpdate.groupBy({
            by: ['projectId'],
            where: { projectId: { in: projectIds } },
            _max: { createdAt: true },
          }),
        ])
      : [[], []];

    const lastActivityByClient = new Map<string, Date>();
    for (const row of [...messageMaxes, ...updateMaxes]) {
      const at = row._max.createdAt;
      const clientId = projectToClient.get(row.projectId);
      if (!at || !clientId) continue;
      const current = lastActivityByClient.get(clientId);
      if (!current || at > current) lastActivityByClient.set(clientId, at);
    }

    const safeClients = clients.map((client) => ({
      id: client.id,
      email: client.email,
      company: client.company,
      phone: client.phone,
      contactName: client.contactName,
      subscription: client.subscription,
      subscriptionTier: client.subscriptionTier,
      onboardingComplete: client.onboardingComplete,
      archivedAt: client.archivedAt,
      createdAt: client.createdAt,
      projects: client.projects,
      lastActivityAt: lastActivityByClient.get(client.id) ?? null,
    }));

    return NextResponse.json(
      { success: true, clients: safeClients, ...pageMeta(params, total) },
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
