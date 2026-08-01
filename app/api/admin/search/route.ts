import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, results: [] }, { status: 200 });
    }

    const [leads, clients, projects, notes] = await Promise.all([
      prisma.lead.findMany({
        where: {
          OR: [
            { company: { contains: q, mode: 'insensitive' } },
            { contactName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 6,
      }),
      prisma.client.findMany({
        where: {
          OR: [
            { company: { contains: q, mode: 'insensitive' } },
            { contactName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 6,
      }),
      prisma.project.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        include: { client: { select: { company: true } } },
        take: 6,
      }),
      prisma.teamNote.findMany({
        where: { content: { contains: q, mode: 'insensitive' } },
        include: { project: { select: { id: true, name: true, client: { select: { company: true } } } } },
        take: 6,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const results = [
      ...leads.map((l) => ({
        type: 'lead' as const,
        id: l.id,
        title: l.company,
        subtitle: l.contactName || l.email || 'Lead',
        href: `/admin/leads/${l.id}`,
      })),
      ...clients.map((c) => ({
        type: 'client' as const,
        id: c.id,
        title: c.company,
        subtitle: c.contactName || c.email,
        href: `/admin/clients/${c.id}`,
      })),
      ...projects.map((p) => ({
        type: 'project' as const,
        id: p.id,
        title: p.name,
        subtitle: p.client.company,
        href: `/admin/projects/${p.id}`,
      })),
      ...notes.map((n) => ({
        type: 'note' as const,
        id: n.id,
        title: `Note on ${n.project.name}`,
        subtitle: `${n.project.client.company} — ${n.content.slice(0, 60)}`,
        href: `/admin/projects/${n.project.id}`,
      })),
    ];

    return NextResponse.json({ success: true, results }, { status: 200 });
  } catch (error) {
    console.error('Admin search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
