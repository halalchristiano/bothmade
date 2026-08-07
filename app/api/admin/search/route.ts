import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { formatCents } from '@/lib/pricing';

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const q = request.nextUrl.searchParams.get('q')?.trim();
    // "(305) 885-5525" and "3058855525" are the same number; stored formats
    // vary, so match on the digits as typed and stripped of punctuation.
    const phoneDigits = q ? q.replace(/[^0-9]/g, '') : '';

    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, results: [] }, { status: 200 });
    }

    const [leads, clients, projects, notes, invoices] = await Promise.all([
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
        // Six columns of the hundred-odd on a Lead. This runs on every
        // debounced keystroke, so the whole row was crossing the wire four
        // times a word to fill in a title and a subtitle.
        select: { id: true, company: true, contactName: true, email: true, phone: true, updatedAt: true },
      }),
      prisma.client.findMany({
        where: {
          OR: [
            { company: { contains: q, mode: 'insensitive' } },
            { contactName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            // The same phone match the leads above get.
            //
            // It was missing here, which meant searching a number found
            // people who had not bought anything and not the ones who had:
            // an inbound call from a paying client returned nothing at all.
            // Clients carry a phone column like leads do, and the moment you
            // most need a name on a ringing number is when it belongs to
            // somebody with work in progress.
            ...(phoneDigits ? [{ phone: { contains: phoneDigits } }] : []),
            { phone: { contains: q } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        select: { id: true, company: true, contactName: true, email: true, phone: true, updatedAt: true },
      }),
      prisma.project.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        select: { id: true, name: true, updatedAt: true, client: { select: { company: true } } },
      }),
      prisma.teamNote.findMany({
        where: { content: { contains: q, mode: 'insensitive' } },
        take: 6,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          content: true,
          createdAt: true,
          project: { select: { id: true, name: true, client: { select: { company: true } } } },
        },
      }),

      /*
       * Invoice numbers, which is the string clients actually quote at you.
       *
       * Every invoice email goes out subject-lined "Invoice INV-0042 — …",
       * and Invoice.number is unique, so it is the one identifier in the
       * system a client already has in their hand when they get in touch.
       * Search knew nothing about it — you could find the company, the
       * project and a passing note mentioning them, but not the document
       * they were phoning about, which meant going to Billing and reading
       * down the list.
       */
      prisma.invoice.findMany({
        where: {
          OR: [
            { number: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 6,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          description: true,
          amountCents: true,
          status: true,
          createdAt: true,
          projectId: true,
          client: { select: { company: true } },
        },
      }),
    ]);

    // When the query was a number, lead with the phone — otherwise the result
    // gives no clue why it matched.
    const matchedOnPhone = (phone: string | null) =>
      phoneDigits.length >= 3 && !!phone && phone.replace(/[^0-9]/g, '').includes(phoneDigits);

    const results = [
      ...leads.map((l) => ({
        type: 'lead' as const,
        id: l.id,
        title: l.company,
        subtitle: matchedOnPhone(l.phone)
          ? [l.phone, l.contactName].filter(Boolean).join(' · ')
          : l.contactName || l.email || 'Lead',
        href: `/admin/leads/${l.id}`,
        updatedAt: l.updatedAt,
      })),
      ...clients.map((c) => ({
        type: 'client' as const,
        id: c.id,
        title: c.company,
        subtitle: matchedOnPhone(c.phone)
          ? [c.phone, c.contactName].filter(Boolean).join(' · ')
          : c.contactName || c.email,
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
      ...invoices.map((inv) => ({
        type: 'invoice' as const,
        id: inv.id,
        title: `Invoice ${inv.number}`,
        // Company and amount, because "INV-0042" alone identifies the row
        // and tells you nothing about whether it is the one you want. The
        // status matters most of all — the usual reason to look an invoice
        // up is to find out whether it has been paid.
        subtitle: `${inv.client.company} · ${formatCents(inv.amountCents)} · ${inv.status}`,
        // Billing already deep-links by project; that is where the invoice
        // and its payment history are shown together.
        href: `/admin/billing?projectId=${inv.projectId}`,
        updatedAt: inv.createdAt,
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
