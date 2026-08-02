import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const q = request.nextUrl.searchParams.get('q')?.trim();
    // "(305) 885-5525" and "3058855525" are the same number; stored formats
    // vary, so match on the digits as typed and stripped of punctuation.
    const phoneDigits = q ? q.replace(/[^0-9]/g, '') : '';

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
            // Searching a number is how you identify an inbound call, which
            // is one of the few times you reach for search under pressure.
            ...(phoneDigits ? [{ phone: { contains: phoneDigits } }] : []),
            { phone: { contains: q } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
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
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      prisma.project.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        include: { client: { select: { company: true } } },
        orderBy: { updatedAt: 'desc' },
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
      ...leads.map((l) => {
        // When the query was a number, lead with the phone — otherwise the
        // result gives no clue why it matched.
        const matchedOnPhone =
          phoneDigits.length >= 3 && !!l.phone && l.phone.replace(/[^0-9]/g, '').includes(phoneDigits);
        return {
          type: 'lead' as const,
          id: l.id,
          title: l.company,
          subtitle: matchedOnPhone
            ? [l.phone, l.contactName].filter(Boolean).join(' · ')
            : l.contactName || l.email || 'Lead',
          href: `/admin/leads/${l.id}`,
          updatedAt: l.updatedAt,
        };
      }),
      ...clients.map((c) => ({
        type: 'client' as const,
        id: c.id,
        title: c.company,
        subtitle: c.contactName || c.email,
        href: `/admin/clients/${c.id}`,
        updatedAt: c.updatedAt,
      })),
      ...projects.map((p) => ({
        type: 'project' as const,
        id: p.id,
        title: p.name,
        subtitle: p.client.company,
        href: `/admin/projects/${p.id}`,
        updatedAt: p.updatedAt,
      })),
      ...notes.map((n) => ({
        type: 'note' as const,
        id: n.id,
        title: `Note on ${n.project.name}`,
        subtitle: `${n.project.client.company} — ${n.content.slice(0, 60)}`,
        href: `/admin/projects/${n.project.id}`,
        updatedAt: n.createdAt,
      })),
    ];

    // Recency-weighted: whatever you or Evan touched most recently surfaces
    // first, rather than grouping by type — on a 2-person team you usually
    // already know roughly what you're looking for, just not where it moved.
    results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return NextResponse.json(
      { success: true, results: results.map(({ updatedAt, ...r }) => r) },
      { status: 200 }
    );
  } catch (error) {
    console.error('Admin search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
