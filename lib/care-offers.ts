// Everything both the admin routes and the public offer page need to say the
// same thing about a care-plan offer: its terms in one serialized shape, and
// one function that sends the invitation, so "create and send" and "send it
// again" cannot drift into describing different plans.

import type { RecurringOffer, RecurringPayment } from '@prisma/client';
import { ADD_ONS, formatCents, type AddOnKey } from '@/lib/pricing';
import { sendCarePlanOfferEmail } from '@/lib/email';
import { buildCareOfferUrl } from '@/lib/share-links';
import {
  buildSchedule,
  isDiscountType,
  parseRecurringAddOns,
  planLabel,
  scheduleLines,
  type CarePlanSchedule,
  type DiscountType,
} from '@/lib/recurring';

export type OfferWithPayments = RecurringOffer & { payments?: RecurringPayment[] };

/** The offer's terms as a schedule, reading the columns back off the row. */
export function scheduleForOffer(offer: RecurringOffer): CarePlanSchedule {
  return buildSchedule({
    addOns: parseRecurringAddOns(offer.addOns),
    monthlyCents: offer.monthlyCents,
    // A row written before a discount type existed, or by hand, must not turn
    // an unrecognized string into a silent 100% off.
    discountType: (isDiscountType(offer.discountType) ? offer.discountType : 'percent') as DiscountType,
    discountValue: offer.discountValue,
    freeMonths: offer.freeMonths,
    discountMonths: offer.discountMonths,
  });
}

/**
 * How the introductory discount is described on invoices and in email.
 *
 * Reads the type through the same guard `scheduleForOffer` uses, and for the
 * same reason. That one falls back to 'percent' for a value it does not
 * recognise — a row written before the column existed, or edited by hand —
 * and this one treated everything that was not exactly 'percent' as an amount
 * in cents. The two then disagreed about one row: the schedule charged 25%
 * off while the invoice line read "$0/month off", because formatCents(25) is
 * twenty-five cents. A discount described as nothing, on the document the
 * client keeps.
 */
export function discountLabel(offer: RecurringOffer): string | null {
  if (offer.discountValue <= 0) return null;
  const type: DiscountType = isDiscountType(offer.discountType) ? offer.discountType : 'percent';
  return type === 'percent'
    ? `Introductory rate (${offer.discountValue}% off)`
    : `Introductory rate (${formatCents(offer.discountValue)}/month off)`;
}

export interface SerializedOffer {
  id: string;
  addOns: AddOnKey[];
  planLabel: string;
  monthlyCents: number;
  discountedCents: number;
  discountType: string;
  discountValue: number;
  freeMonths: number;
  discountMonths: number;
  firstYearSavings: number;
  standardRateFromMonth: number;
  scheduleLines: Array<{ period: string; detail: string }>;
  status: string;
  note: string | null;
  offerUrl: string;
  sentAt: string;
  acceptedAt: string | null;
  canceledAt: string | null;
  paidToDate: number;
  paymentCount: number;
  lastPaidAt: string | null;
}

export function serializeOffer(offer: OfferWithPayments): SerializedOffer {
  const schedule = scheduleForOffer(offer);
  const payments = offer.payments ?? [];

  return {
    id: offer.id,
    addOns: schedule.addOns,
    planLabel: planLabel(schedule.addOns),
    monthlyCents: schedule.monthlyCents,
    discountedCents: schedule.discountedCents,
    discountType: offer.discountType,
    discountValue: offer.discountValue,
    freeMonths: schedule.freeMonths,
    discountMonths: schedule.discountMonths,
    firstYearSavings: schedule.firstYearSavings,
    standardRateFromMonth: schedule.standardRateFromMonth,
    scheduleLines: scheduleLines(schedule),
    status: offer.status,
    note: offer.note,
    // Handed only to staff and to whoever already holds the link — it is the
    // secret that authorizes signing up for a monthly charge.
    offerUrl: buildCareOfferUrl(offer.token),
    sentAt: offer.sentAt.toISOString(),
    acceptedAt: offer.acceptedAt?.toISOString() ?? null,
    canceledAt: offer.canceledAt?.toISOString() ?? null,
    paidToDate: payments.reduce((sum, p) => sum + p.amount, 0),
    paymentCount: payments.length,
    lastPaidAt: payments[0]?.createdAt.toISOString() ?? null,
  };
}

/**
 * Emails the invitation. Shared by "create and send" and "send it again" so a
 * resend can never describe different terms from the original.
 */
export async function sendOfferInvitation(params: {
  offer: RecurringOffer;
  clientEmail: string;
  contactName: string | null;
  company: string;
  /** The project's own add-ons, to tell an upsell from a renewal in the copy. */
  projectAddOns: string;
}) {
  const schedule = scheduleForOffer(params.offer);
  const inScope = new Set(parseRecurringAddOns(params.projectAddOns));

  return sendCarePlanOfferEmail({
    toEmail: params.clientEmail,
    contactName: params.contactName,
    company: params.company,
    planLabel: planLabel(schedule.addOns),
    offerUrl: buildCareOfferUrl(params.offer.token),
    scheduleLines: scheduleLines(schedule),
    savingsLabel: schedule.firstYearSavings > 0 ? formatCents(schedule.firstYearSavings) : null,
    note: params.offer.note,
    alreadyInScope: schedule.addOns.length > 0 && schedule.addOns.every((key) => inScope.has(key)),
  });
}

/** The catalogue rows the admin picker renders, so it isn't hardcoded twice. */
export function recurringCatalogue(keys: AddOnKey[]) {
  return keys.map((key) => ({
    key,
    label: ADD_ONS[key].label,
    description: ADD_ONS[key].description,
    benefit: ADD_ONS[key].benefit,
    price: ADD_ONS[key].price,
  }));
}
