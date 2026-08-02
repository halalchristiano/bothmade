import { prisma } from '@/lib/prisma';
import { isFurtherAlong, type LeadStatus } from '@/lib/leads';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
  formatCents,
  type AddOnKey,
  type BaseService,
  type ClientType,
  type TimelineKey,
} from '@/lib/pricing';

export interface PricingConfiguration {
  baseService: BaseService;
  addOns: AddOnKey[];
  clientType: ClientType;
  timeline: TimelineKey;
}

export interface InboundContact {
  email: string;
  company: string;
  contactName?: string | null;
  phone?: string | null;
}

/**
 * A configuration rendered as label/value pairs — the single source both the
 * CRM note, the internal notification, and the buyer's own recap email read
 * from, so all three describe the same purchase in the same words.
 */
export function configurationRows(
  config: PricingConfiguration
): Array<{ label: string; value: string }> {
  const breakdown = calculatePrice(config);
  const addOnLabels = config.addOns.map((key) => ADD_ONS[key].label);

  return [
    { label: 'Service', value: BASE_SERVICES[config.baseService].label },
    { label: 'Add-ons', value: addOnLabels.length ? addOnLabels.join(', ') : 'None' },
    { label: 'Organisation', value: CLIENT_TYPES[config.clientType].label },
    {
      label: 'Timeline',
      value: `${TIMELINES[config.timeline].label} (${TIMELINES[config.timeline].weeks})`,
    },
    { label: 'Total', value: formatCents(breakdown.totalPrice) },
  ];
}

/** The same thing as one plain-text block, for CRM note fields. */
export function configurationSummary(config: PricingConfiguration): string {
  return configurationRows(config)
    .map((row) => `${row.label}: ${row.value}`)
    .join('\n');
}

/**
 * Records a public pricing-calculator configuration as a CRM lead.
 *
 * Both public paths off /start funnel through here:
 *
 *   - "send us your picks", which used to fire an email into an inbox and
 *     leave no row anywhere, so a hot inbound lead lived exactly as long as
 *     someone remembered to read that email; and
 *   - the moment a Stripe checkout session is created, which is the last
 *     point we hear from a buyer who then abandons the card form. Those were
 *     previously invisible — an abandoned checkout produced no record at all,
 *     so the highest-intent prospects on the site were the only ones nobody
 *     could follow up with.
 *
 * Re-configuring updates the existing lead rather than stacking duplicates,
 * and never drags a lead backwards down the pipeline: a prospect already at
 * "proposal sent" who plays with the calculator again keeps their status.
 *
 * Returns the lead id, or null if anything went wrong — every caller is in
 * the middle of a user-facing request, and a CRM write failing must never be
 * the reason somebody can't reach checkout.
 */
export async function recordInboundLead({
  contact,
  config,
  status,
  source,
  note,
}: {
  contact: InboundContact;
  config: PricingConfiguration;
  status: LeadStatus;
  source: string;
  /** One line of context for the rep, prepended to the configuration dump. */
  note: string;
}): Promise<string | null> {
  try {
    const email = contact.email.trim().toLowerCase();
    if (!email) return null;

    const breakdown = calculatePrice(config);
    const salesNote = `${note}\n\n${configurationSummary(config)}`;

    const proposalFields = {
      proposalBaseService: config.baseService,
      proposalAddOns: config.addOns.join(','),
      proposalClientType: config.clientType,
      proposalTimeline: config.timeline,
      proposalTotalPrice: breakdown.totalPrice,
      estimatedValue: breakdown.totalPrice,
      salesNote,
    };

    const existing = await prisma.lead.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const updated = await prisma.lead.update({
        where: { id: existing.id },
        data: {
          ...proposalFields,
          // Fill blanks from the form, but never overwrite what the team
          // has since researched or corrected by hand.
          contactName: existing.contactName || contact.contactName || null,
          phone: existing.phone || contact.phone || null,
          company: existing.company || contact.company,
          ...(isFurtherAlong(existing.status, status) ? { status } : {}),
        },
      });
      return updated.id;
    }

    const created = await prisma.lead.create({
      data: {
        company: contact.company,
        contactName: contact.contactName || null,
        email,
        phone: contact.phone || null,
        status,
        source,
        ...proposalFields,
      },
    });
    return created.id;
  } catch (error) {
    console.error('Failed to record inbound lead:', error);
    return null;
  }
}
