// The document you hand over when somebody asks you to prove a contract was
// signed — a chargeback rep, opposing counsel, an insurer, a regulator.
//
// The executed contract shows *what* was agreed. This shows *that* it was
// agreed, by whom, and how you know: the typed name, the timestamp, the
// address and browser it came from, the sentence the signer accepted, the
// SHA-256 of the document they saw, the payment that followed, and the
// chronological trail from "we emailed a link" to "money arrived".
//
// Modelled on the certificate of completion an e-signature provider issues
// alongside a signed document, because that is the artifact people on the
// other side of a dispute already know how to read.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { LOGO_BACKGROUND, LOGO_HEIGHT, LOGO_WIDTH, logoJpegBytes } from '@/lib/brand-logo';
import { COMPANY_ADDRESS_INLINE, COMPANY_EMAIL, COMPANY_NAME } from '@/lib/company';
import { winAnsi } from '@/lib/pdf-text';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LABEL_WIDTH = 132;
const BLACK = rgb(0.08, 0.08, 0.1);
const GRAY = rgb(0.42, 0.42, 0.46);
const ACCENT = rgb(0.13, 0.55, 0.85);
const GREEN = rgb(0.1, 0.5, 0.3);
const AMBER = rgb(0.65, 0.45, 0.05);
const HAIRLINE = rgb(0.85, 0.85, 0.87);
const BRAND_FIELD = rgb(LOGO_BACKGROUND.r, LOGO_BACKGROUND.g, LOGO_BACKGROUND.b);
const BAND_HEIGHT = 66;

export interface CertificateEvent {
  at: Date;
  description: string;
}

export interface CertificatePayment {
  at: Date;
  amountLabel: string;
  type: string;
  stripeSessionId: string | null;
}

export interface SignatureCertificateInput {
  /** Stable reference for this record — the lead id the signature lives on. */
  reference: string;
  company: string;
  contactName: string | null;
  clientEmail: string;
  serviceLabel: string;
  totalPriceLabel: string;

  /** Null for signatures taken before the typed name was captured. */
  signerName: string | null;
  signedAt: Date;
  ip: string | null;
  userAgent: string | null;
  statement: string | null;
  documentHash: string | null;
  signedContractUrl: string | null;

  payments: CertificatePayment[];
  events: CertificateEvent[];

  generatedAt: Date;
  /** Who pressed the button — a certificate nobody produced is worth less. */
  generatedBy: string;
}

/** UTC, unambiguously labelled. A dispute crossing time zones is the normal case. */
function stamp(date: Date): string {
  return `${date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')} UTC`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';

  for (const word of text.split(/\s+/)) {
    let rest = word;
    // Hashes and user agent strings have no spaces to wrap on.
    while (font.widthOfTextAtSize(rest, size) > maxWidth) {
      if (current) {
        lines.push(current);
        current = '';
      }
      let cut = rest.length;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (!rest) continue;

    const candidate = current ? `${current} ${rest}` : rest;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = rest;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildSignatureCertificatePdf(input: SignatureCertificateInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  let pageNum = 1;

  const finishPage = () => {
    page.drawText(winAnsi(`${COMPANY_NAME} — ${COMPANY_ADDRESS_INLINE}`), {
      x: MARGIN,
      y: 42,
      size: 8,
      font,
      color: GRAY,
    });
    page.drawText(winAnsi(`Certificate of Signature — ${input.reference} — Page ${pageNum}`), {
      x: MARGIN,
      y: 30,
      size: 8,
      font,
      color: GRAY,
    });
  };

  const newPage = () => {
    finishPage();
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageNum += 1;
    y = PAGE_HEIGHT - MARGIN;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 20) newPage();
  };

  const heading = (text: string) => {
    ensureSpace(46);
    y -= 10;
    page.drawText(winAnsi(text), { x: MARGIN, y, size: 11, font: bold, color: ACCENT });
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.75,
      color: HAIRLINE,
    });
    y -= 16;
  };

  /**
   * A label in the left column and its value in the right, the value
   * wrapping under itself. Everything on this page is a fact with a name,
   * so nearly the whole document is this one shape.
   */
  const row = (
    label: string,
    value: string,
    opts: { f?: PDFFont; color?: ReturnType<typeof rgb>; size?: number } = {}
  ) => {
    const { f = font, color = BLACK, size = 9.5 } = opts;
    const valueWidth = CONTENT_WIDTH - LABEL_WIDTH;
    const lines = wrapText(winAnsi(value), f, size, valueWidth);
    ensureSpace(lines.length * 13 + 4);
    page.drawText(winAnsi(label), { x: MARGIN, y, size: 9, font, color: GRAY });
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + LABEL_WIDTH, y, size, font: f, color });
      y -= 13;
    }
    y -= 3;
  };

  const paragraph = (text: string, opts: { size?: number; color?: ReturnType<typeof rgb> } = {}) => {
    const { size = 9, color = GRAY } = opts;
    for (const line of wrapText(winAnsi(text), font, size, CONTENT_WIDTH)) {
      ensureSpace(12);
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= 12;
    }
    y -= 5;
  };

  // Header band, matching the contract and invoice.
  const logo = await doc.embedJpg(logoJpegBytes());
  const logoWidth = 140;
  const logoHeight = (logoWidth * LOGO_HEIGHT) / LOGO_WIDTH;
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - BAND_HEIGHT,
    width: PAGE_WIDTH,
    height: BAND_HEIGHT,
    color: BRAND_FIELD,
  });
  page.drawImage(logo, {
    x: MARGIN,
    y: PAGE_HEIGHT - BAND_HEIGHT / 2 - logoHeight / 2,
    width: logoWidth,
    height: logoHeight,
  });
  y = PAGE_HEIGHT - BAND_HEIGHT - 36;

  page.drawText('Certificate of Signature', { x: MARGIN, y, size: 17, font: bold, color: BLACK });
  y -= 20;
  page.drawText(winAnsi(`Record reference ${input.reference}`), { x: MARGIN, y, size: 9.5, font, color: GRAY });
  y -= 24;

  paragraph(
    `This certificate records the electronic signature applied to the project agreement between ${COMPANY_NAME} and ${input.company}. It is generated from the signature record held at the time of signing and is issued alongside, not instead of, the executed agreement itself.`,
    { size: 9.5, color: BLACK }
  );

  heading('SIGNATORY');
  row('Signed by', input.signerName || 'Not captured — see note below', {
    f: bold,
    size: 12,
    color: input.signerName ? BLACK : AMBER,
  });
  row('Client', input.company);
  row('Contact on file', input.contactName || '—');
  row('Email', input.clientEmail);

  heading('SIGNATURE EVENT');
  row('Signed at', stamp(input.signedAt), { f: bold });
  row('IP address', input.ip || 'Not captured');
  row('Browser', input.userAgent || 'Not captured');
  if (input.statement) {
    row('Statement accepted', `"${input.statement}"`);
  } else {
    row('Statement accepted', 'Not captured — see note below', { color: AMBER });
  }

  heading('DOCUMENT SIGNED');
  row('Service', input.serviceLabel);
  row('Total fee', input.totalPriceLabel, { f: bold });
  row('SHA-256', input.documentHash || 'Not captured', { f: mono, size: 8 });
  row('Executed copy', input.signedContractUrl || 'Not generated — see note below', {
    color: input.signedContractUrl ? BLACK : AMBER,
  });

  heading('PAYMENT');
  if (input.payments.length === 0) {
    row('Status', 'No payment recorded against this agreement.', { color: AMBER });
  } else {
    for (const payment of input.payments) {
      row(payment.amountLabel, `${payment.type} — received ${stamp(payment.at)}`, { f: bold });
      // Stripe's own id, on its own line, because it is the one item here
      // that can be checked against a system nobody at this company runs.
      if (payment.stripeSessionId) {
        row('', payment.stripeSessionId, { f: mono, size: 8, color: GRAY });
      }
    }
  }

  heading('AUDIT TRAIL');
  if (input.events.length === 0) {
    paragraph('No recorded events.');
  } else {
    for (const event of input.events) {
      row(stamp(event.at).slice(0, 16), event.description, { size: 9 });
    }
  }

  // The honest part. A certificate that quietly omits what it doesn't have
  // is worse than one that names the gaps, because the gaps get found.
  const missing: string[] = [];
  if (!input.signerName) missing.push('a typed signer name');
  if (!input.statement) missing.push('the wording of the statement accepted');
  if (!input.signedContractUrl) missing.push('a saved copy of the executed document');
  if (!input.ip) missing.push('the originating IP address');

  heading('NOTES ON THIS RECORD');
  if (missing.length > 0) {
    paragraph(
      `This signature predates the capture of ${missing.join(', ')}. Those fields are shown as "Not captured" above rather than reconstructed, and nothing in this certificate has been inferred or backfilled.`,
      { color: AMBER }
    );
  }
  paragraph(
    'The signature was recorded at the moment the signatory accepted the terms, which precedes payment. The SHA-256 above is taken over the agreement text and the acceptance statement exactly as displayed to the signatory at that moment.'
  );
  paragraph(
    `Issued ${stamp(input.generatedAt)} by ${input.generatedBy}. Questions about this record: ${COMPANY_EMAIL}.`
  );

  y -= 6;
  ensureSpace(20);
  page.drawText('END OF CERTIFICATE', { x: MARGIN, y, size: 9, font: bold, color: GREEN });

  finishPage();
  return doc.save();
}
