import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET() {
  try {
    const session = await getCurrentSession();

    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const [totalClients, totalProjects, statusCounts, recentProjects] =
      await Promise.all([
        prisma.client.count(),
        prisma.project.count(),
        prisma.project.groupBy({
          by: ['status'],
          _count: { status: true },
        }),
        prisma.project.findMany({
          take: 5,
          orderBy: { updatedAt: 'desc' },
          include: {
            client: { select: { company: true } },
          },
        }),
      ]);

    const byStatus: Record<string, number> = {
      discovery: 0,
      design: 0,
      build: 0,
      launch: 0,
      complete: 0,
    };
    for (const row of statusCounts) {
      byStatus[row.status] = row._count.status;
    }

    const activeProjects = totalProjects - byStatus.complete;

    return NextResponse.json(
      {
        success: true,
        stats: {
          totalClients,
          totalProjects,
          activeProjects,
          byStatus,
          recentActivity: recentProjects.map((p) => ({
            id: p.id,
            name: p.name,
            company: p.client.company,
            status: p.status,
            updatedAt: p.updatedAt,
          })),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get admin stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
