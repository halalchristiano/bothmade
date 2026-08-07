'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_ACTIVITY_MANUAL_TYPES,
  LEAD_ACTIVITY_LABELS,
  leadActivityIsInternal,
  PAIN_POINTS,
  painPointSentence,
  parseSalesPoints,
  type LeadStatus,
  type LeadActivityType,
  type PainPointKey,
} from '@/lib/leads';
import { SALES_TEMPLATES } from '@/lib/sales-templates';
import { readOpens } from '@/lib/lead-opens';
import { findGlossaryTerms } from '@/lib/glossary';
import { buildCallScript, callScriptToText, painPointPitch } from '@/lib/call-script';
import { personalise, priceToTotal, type PlaybookEntry, type PricedItem } from '@/lib/playbook-seed';
import { OBJECTIONS } from '@/lib/objections';
import { CALL_OUTCOMES } from '@/lib/call-outcomes';
import { leadLocalTime } from '@/lib/local-time';
import { buildFollowUpDraft } from '@/lib/follow-up-emails';
import { LostReasonModal } from '@/components/admin/LostReasonModal';
import { PhoneField } from '@/components/PhoneField';
import { PdfOrLinkField } from '@/components/admin/PdfOrLinkField';
import { EmailComposer } from '@/components/admin/EmailComposer';
import { LeadMockupsPanel } from '@/components/admin/MockupAttachments';
import { MockupLinkButton, MockupLinkSlot } from '@/components/admin/MockupLinkSlot';
import { SendMockupPanel } from '@/components/admin/SendMockupPanel';
import type { MockupKind } from '@/lib/mockup-kinds';
import { AddOnPicker, BaseServicePicker } from '@/components/admin/AddOnPicker';
import { useLeadStatusChange } from '@/components/admin/useLeadStatusChange';
import { Section } from '@/components/admin/ui';
import { DealTimeline } from '@/components/admin/lead/DealTimeline';
import { CustomLineItems } from '@/components/admin/lead/CustomLineItems';
import {
  FileField,
  StepLabel,
  PricedCard,
  SAVE_ERROR_MESSAGE,
  SectionNote,
  Step,
  type Activity,
  type SectionNoteSharedProps,
} from '@/components/admin/lead/primitives';
import {
  Mail,
  Phone,
  Send,
  CheckCircle2,
  RefreshCw,
  Tag,
  CalendarClock,
  User,
  Compass,
  DollarSign,
  StickyNote,
  AlertTriangle,
  MoreVertical,
  Trash2,
  MailX,
  ChevronRight,
  FileSignature,
  FileText,
  FolderOpen,
  Eye,
  Lock,
} from 'lucide-react';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  PAIN_POINT_BRIEFS,
  buildSalesRecommendations,
  classifyWrittenPoint,
  inferPainPointsFromNotes,
  MAX_CUSTOM_SCOPE_CHARS,
  MIN_CUSTOM_SCOPE_CHARS,
  calculatePrice,
  customItemsMissingScope,
  customItemsTotal,
  depositAmount,
  firstInstalmentPercent,
  instalmentSchedule,
  dependentsOf,
  expandAddOnDependencies,
  formatCents,
  formatCentsExact,
  isAddOnKey,
  isBaseService,
  isClientType,
  isIncludedInBase,
  isTimelineKey,
  sanitizeCustomItems,
  withBaseIncludes,
  type AddOnKey,
  type BaseService,
  type ClientType,
  type CustomItem,
  type TimelineKey,
} from '@/lib/pricing';


interface LeadDetail {
  isConsumer?: boolean;
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  source: string | null;
  estimatedValue: number | null;
  painPoints: string;
  notes: string | null;
  hotLead: boolean;
  contractStatus: 'not_sent' | 'sent' | 'signed';
  lostReason: string | null;
  nextFollowUpAt: string | null;
  mockupRequested: boolean;
  mockupRequestedAt: string | null;
  mockupUrl: string | null;
  mockupFolderUrl: string | null;
  mockupDeliveredAt: string | null;
  // Enough to say where the mockup is without opening the section — see
  // `mockupSummary` below. The API has always returned these; the type simply
  // never asked for them.
  mockups: Array<{
    id: string;
    url: string;
    fileName: string | null;
    createdAt: string;
    sentAt?: string | null;
    viewCount?: number;
  }>;
  mockupSentManuallyAt: string | null;
  vercelDeployPassword: string | null;
  invoicePdfUrl: string | null;
  industry: string | null;
  contactRole: string | null;
  city: string | null;
  region: string | null;
  companySize: string | null;
  employeeCount: number | null;
  locationCount: number | null;
  annualRevenueCents: number | null;
  googleRating: number | null;
  googleReviewCount: number | null;
  tags: string;
  doNotContact: boolean;
  doNotContactReason: string | null;
  addedAt: string;
  clientTakenOnAt: string | null;
  agreementSignedAt: string | null;
  signedContractUrl?: string | null;
  /** Capability token for the public sign-and-pay link. */
  shareToken?: string;
  agreementIp: string | null;
  agreementSignerName?: string | null;
  agreementUserAgent?: string | null;
  qualNeed: string | null;
  qualAuthority: string | null;
  qualBudget: string | null;
  qualTiming: string | null;
  qualMotivation: string | null;
  qualifiedAt: string | null;
  coldEmailDraft: string | null;
  coldEmailSentAt: string | null;
  coldEmailOpens: number;
  coldEmailOpenedAt: string | null;
  coldEmailLastOpenedAt: string | null;
  mockupEmailDraft: string | null;
  personalizedObservation: string | null;
  emailDeliveryFailedAt: string | null;
  emailDeliveryFailedReason: string | null;
  originalWebsite: string | null;
  salesNote: string | null;
  currentSiteAssessment: string | null;
  customPainPoints: string | null;
  essentialPoints: string | null;
  upsellPoints: string | null;
  estimateLowCents: number | null;
  estimateHighCents: number | null;
  assignedTo: { name: string | null } | null;
  activities: Activity[];
  // What was actually saved the last time a sign-and-pay link was
  // prepared/sent — the source of truth for whether the builder's current
  // state still matches what the client can see.
  proposalBaseService: string | null;
  proposalAddOns: string;
  proposalClientType: string | null;
  proposalTimeline: string | null;
  proposalDepositOnly: boolean;
  proposalTotalPrice: number | null;
  proposalCustomItems?: Array<{ label: string; description?: string; priceCents: number }>;
}

/**
 * The project this lead became, if it did. Fetched alongside the lead so the
 * deal timeline can show whether the money actually landed — the half of the
 * deal that leaves Sales the moment a lead converts.
 */
interface DealProject {
  id: string;
  name: string;
  totalPrice: number;
  instalments: Array<{
    index: number;
    label: string;
    amountCents: number;
    status: string;
    paidAt: string | null;
    dueAt: string | null;
  }>;
}

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const leadId = params.leadId as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [showObjections, setShowObjections] = useState(false);
  const [loggingOutcome, setLoggingOutcome] = useState<string | null>(null);
  const [outcomeNote, setOutcomeNote] = useState('');
  const [outcomeDate, setOutcomeDate] = useState('');
  const [savingOutcome, setSavingOutcome] = useState(false);
  // What just happened, and enough to put it back. Cleared once he moves on.
  const [lastOutcome, setLastOutcome] = useState<{
    label: string;
    summary: string;
    activityId: string;
    previous: { status: string; nextFollowUpAt: string | null; lostReason: string | null };
  } | null>(null);
  const [undoing, setUndoing] = useState(false);
  // The drafted follow-up, shown after an outcome is logged. Editable — it's
  // a starting point, not something to fire off unread.
  const [followUp, setFollowUp] = useState<{ subject: string; body: string; why: string } | null>(null);
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [followUpResult, setFollowUpResult] = useState<string | null>(null);
  // Recomputed on a timer so the lead's local time doesn't silently go stale
  // on a page left open between calls.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [playbook, setPlaybook] = useState<PlaybookEntry[]>([]);
  const [duplicates, setDuplicates] = useState<Array<{ id: string; company: string; status: string }>>([]);
  const [dealProject, setDealProject] = useState<DealProject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [composingEmail, setComposingEmail] = useState(false);
  const [sendingColdDraft, setSendingColdDraft] = useState(false);
  const [coldDraftSent, setColdDraftSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Shared by every quick PATCH-style save on this page (edit form, files,
  // qualification, follow-up, hot toggle, contract status, mockup request).
  // Before this, a failed save closed the form silently and the change
  // quietly reverted on the next load. Same error-path idea as
  // useLeadStatusChange's statusError, but for the fire-and-forget saves.
  // Cleared again by the next action that succeeds.
  const [saveError, setSaveError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [notes, setNotes] = useState('');
  const [originalWebsite, setOriginalWebsite] = useState('');
  const [salesNote, setSalesNote] = useState('');
  const [painPoints, setPainPoints] = useState<PainPointKey[]>([]);

  // Deliverables and access, edited together because they arrive together —
  // a mockup goes up, its PDF gets exported, and the deployment it lives on
  // has a password. The invoice joins them once the deal is actually won.
  const [mockupPdfUrl, setMockupPdfUrl] = useState('');
  const [invoicePdfUrl, setInvoicePdfUrl] = useState('');
  const [vercelDeployPassword, setVercelDeployPassword] = useState('');
  const [savingFiles, setSavingFiles] = useState(false);

  const [qualNeed, setQualNeed] = useState('');
  const [qualAuthority, setQualAuthority] = useState('');
  const [qualBudget, setQualBudget] = useState('');
  const [qualTiming, setQualTiming] = useState('');
  const [qualMotivation, setQualMotivation] = useState('');
  const [savingQual, setSavingQual] = useState(false);

  const [activityType, setActivityType] = useState<LeadActivityType>('note');
  // A rep mid-call losing a half-typed note to a dropped connection or a
  // stray refresh is the worst possible failure mode for this field — so
  // the draft round-trips through localStorage, not just React state.
  const [activityContent, setActivityContent] = useState(() =>
    typeof window === 'undefined' ? '' : localStorage.getItem(`bothmade_activity_draft_${leadId}`) || ''
  );
  const [activityUrl, setActivityUrl] = useState('');
  const [sendEmailNow, setSendEmailNow] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [loggingActivity, setLoggingActivity] = useState(false);
  const [activityMessage, setActivityMessage] = useState('');

  useEffect(() => {
    const key = `bothmade_activity_draft_${leadId}`;
    if (activityContent) localStorage.setItem(key, activityContent);
    else localStorage.removeItem(key);
  }, [activityContent, leadId]);

  // Quick per-section notes on the priced brief — a rep on the phone jots
  // feedback against the exact item being discussed instead of one big note
  // at the end. Keyed by section label; lives at this level and flows into
  // the module-scoped SectionNote/PricedCard as props, so no unrelated state
  // change can remount the box and lose whatever's mid-typing.
  const [sectionNoteDrafts, setSectionNoteDrafts] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem(`bothmade_section_notes_draft_${leadId}`) || '{}');
    } catch {
      return {};
    }
  });
  const [sectionNoteObjection, setSectionNoteObjection] = useState<Record<string, boolean>>({});
  const [sectionNoteSaving, setSectionNoteSaving] = useState<Record<string, boolean>>({});
  const [sectionNoteJustLogged, setSectionNoteJustLogged] = useState<Record<string, boolean>>({});
  const [sectionNoteError, setSectionNoteError] = useState<Record<string, string>>({});

  useEffect(() => {
    const key = `bothmade_section_notes_draft_${leadId}`;
    const hasAny = Object.values(sectionNoteDrafts).some(Boolean);
    if (hasAny) localStorage.setItem(key, JSON.stringify(sectionNoteDrafts));
    else localStorage.removeItem(key);
  }, [sectionNoteDrafts, leadId]);

  const handleLogSectionNote = async (sectionLabel: string) => {
    const text = (sectionNoteDrafts[sectionLabel] || '').trim();
    if (!text) return;
    setSectionNoteSaving((prev) => ({ ...prev, [sectionLabel]: true }));
    setSectionNoteError((prev) => ({ ...prev, [sectionLabel]: '' }));
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: sectionNoteObjection[sectionLabel] ? 'objection' : 'note',
          content: `[${sectionLabel}] ${text}`,
        }),
      });
      if (res.ok) {
        setSectionNoteDrafts((prev) => ({ ...prev, [sectionLabel]: '' }));
        setSectionNoteObjection((prev) => ({ ...prev, [sectionLabel]: false }));
        setSectionNoteJustLogged((prev) => ({ ...prev, [sectionLabel]: true }));
        setTimeout(() => {
          setSectionNoteJustLogged((prev) => ({ ...prev, [sectionLabel]: false }));
        }, 2500);
        load();
      } else {
        setSectionNoteError((prev) => ({ ...prev, [sectionLabel]: "Couldn't save — your note is still here, try again." }));
      }
    } catch {
      setSectionNoteError((prev) => ({ ...prev, [sectionLabel]: "No connection — your note is saved, try again when back online." }));
    } finally {
      setSectionNoteSaving((prev) => ({ ...prev, [sectionLabel]: false }));
    }
  };

  const [proposalService, setProposalServiceRaw] = useState<BaseService>('website');
  const [proposalAddOns, setProposalAddOns] = useState<AddOnKey[]>([]);

  const setProposalService = (next: BaseService) => {
    setProposalServiceRaw(next);
    setProposalAddOns((prev) => withBaseIncludes(next, prev));
  };
  const [proposalClientType, setProposalClientType] = useState<ClientType>('smb');
  const [proposalTimeline, setProposalTimeline] = useState<TimelineKey>('standard');
  // Ad-hoc items Evan adds beyond the fixed catalogue. draftLabel/draftPrice/
  // draftDescription hold the add-row inputs until "Add" commits them into
  // customItems.
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [draftCustomLabel, setDraftCustomLabel] = useState('');
  const [draftCustomPrice, setDraftCustomPrice] = useState('');
  const [draftCustomDescription, setDraftCustomDescription] = useState('');
  // Guards the one-time hydration of the builder from the saved proposal (or
  // a local draft) so later load() calls — triggered by unrelated actions
  // elsewhere on the page — never silently overwrite an in-progress edit.
  const hydratedProposalRef = useRef(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const clearProposalDraft = () => {
    try {
      localStorage.removeItem(`bothmade_proposal_draft_${leadId}`);
    } catch {
      // no-op — nothing to clean up if storage isn't accessible
    }
  };

  // Lets him add the missing email right where he discovers he needs it,
  // instead of backing out of the builder to go find the edit form.
  const [quickEmail, setQuickEmail] = useState('');
  const [savingQuickEmail, setSavingQuickEmail] = useState(false);
  const handleSaveQuickEmail = async () => {
    const value = quickEmail.trim();
    if (!value) return;
    setSavingQuickEmail(true);
    try {
      await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      });
      setQuickEmail('');
      load();
    } finally {
      setSavingQuickEmail(false);
    }
  };

  // Un-does whatever's been tinkered with since the last send — one click
  // back to exactly what the client's link currently shows, instead of
  // manually toggling every changed add-on and custom item back by hand.
  const handleRevertToLastSent = () => {
    if (!lead) return;
    if (lead.proposalBaseService && isBaseService(lead.proposalBaseService)) {
      setProposalServiceRaw(lead.proposalBaseService);
    }
    setProposalAddOns(lead.proposalAddOns.split(',').filter((a): a is AddOnKey => isAddOnKey(a)));
    if (lead.proposalClientType && isClientType(lead.proposalClientType)) setProposalClientType(lead.proposalClientType);
    if (lead.proposalTimeline && isTimelineKey(lead.proposalTimeline)) setProposalTimeline(lead.proposalTimeline);
    setDepositOnly(lead.proposalDepositOnly);
    setIsConsumer(Boolean(lead.isConsumer));
    setCustomItems(sanitizeCustomItems(lead.proposalCustomItems || []));
  };

  // A plain-text version of the proposal for pasting into a text/WhatsApp
  // message — not every client checks email fast, and typing this out by
  // hand is exactly the kind of busywork this button exists to remove.
  const [copiedProposalText, setCopiedProposalText] = useState(false);
  const handleCopyProposalText = async () => {
    if (!lead) return;
    const schedule = instalmentSchedule(proposalGrandTotal);
    const lines = [
      `${lead.company} — ${BASE_SERVICES[proposalService].label}`,
      proposalAddOns.length ? `Add-ons: ${proposalAddOns.map((k) => ADD_ONS[k].label).join(', ')}` : null,
      // Spelled out rather than listed by name — a texted summary is exactly
      // where "custom X" gets read as whatever the reader was hoping for.
      ...customItems.map((c) => `${c.label} (${formatCents(c.priceCents)})${c.description ? `: ${c.description}` : ''}`),
      `Total: ${formatCents(proposalGrandTotal)}`,
      // The schedule survives the trip into a text message. A pasted summary
      // that mentions one number is how a client ends up believing the fee
      // is the number they were shown.
      ...(depositOnly
        ? schedule.map((r) => `  ${r.label} — ${formatCentsExact(r.amountCents)} (${r.triggerLabel})`)
        : ['  Payable in full up front']),
      paymentLinkUrl ? `Review & pay: ${paymentLinkUrl}` : null,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedProposalText(true);
      setTimeout(() => setCopiedProposalText(false), 2500);
    } catch {
      setProposalError('Could not copy to clipboard — your browser may be blocking it.');
    }
  };

  // Formats what he's typing as a price ("3000" -> "3,000") without
  // fighting the cursor — only digits and a single decimal point survive,
  // commas are inserted purely for display and stripped again on parse.
  const formatCurrencyInputValue = (raw: string): string => {
    const cleaned = raw.replace(/[^\d.]/g, '');
    const firstDot = cleaned.indexOf('.');
    const [intPart, ...rest] = firstDot === -1 ? [cleaned] : [cleaned.slice(0, firstDot), cleaned.slice(firstDot + 1)];
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return firstDot === -1 ? withCommas : `${withCommas}.${rest.join('').slice(0, 2)}`;
  };

  const draftCustomScopeShort = draftCustomDescription.trim().length < MIN_CUSTOM_SCOPE_CHARS;

  const addCustomItem = () => {
    const label = draftCustomLabel.trim();
    const description = draftCustomDescription.trim();
    const dollars = parseFloat(draftCustomPrice.replace(/,/g, ''));
    if (!label || !Number.isFinite(dollars) || dollars <= 0) return;
    if (description.length < MIN_CUSTOM_SCOPE_CHARS) return;
    setCustomItems((prev) => [...prev, { label, description, priceCents: Math.round(dollars * 100) }]);
    setDraftCustomLabel('');
    setDraftCustomPrice('');
    setDraftCustomDescription('');
  };

  /** Fills in the scope on an item that was saved before descriptions were
   * required — the proposal still loads, it just can't produce a contract
   * until this is written. */
  const setCustomItemDescription = (index: number, description: string) => {
    setCustomItems((prev) => prev.map((item, i) => (i === index ? { ...item, description } : item)));
  };

  // Everything the contract can't be generated from yet. Surfaced next to the
  // buttons it disables so the reason is visible at the point of the block,
  // not discovered as a failed download.
  const customItemsNeedingScope = customItemsMissingScope(customItems);
  const customScopeBlocked = customItemsNeedingScope.length > 0;

  // A deleted custom item stays recoverable for a few seconds instead of
  // being gone the instant a trash icon gets tapped by mistake.
  const [lastRemovedCustomItem, setLastRemovedCustomItem] = useState<{ item: CustomItem; index: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const removeCustomItem = (index: number) => {
    setCustomItems((prev) => {
      setLastRemovedCustomItem({ item: prev[index], index });
      return prev.filter((_, i) => i !== index);
    });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setLastRemovedCustomItem(null), 6000);
  };

  const undoRemoveCustomItem = () => {
    if (!lastRemovedCustomItem) return;
    setCustomItems((prev) => {
      const next = [...prev];
      next.splice(lastRemovedCustomItem.index, 0, lastRemovedCustomItem.item);
      return next;
    });
    setLastRemovedCustomItem(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };
  const [paymentLinkUrl, setPaymentLinkUrl] = useState('');
  const [revokingLink, setRevokingLink] = useState(false);
  const [revokeNote, setRevokeNote] = useState('');
  // The instalment schedule is the default because it is the deal: the
  // contract, the invoices and the emails are all written around three
  // payments. This started life as an unticked box, which meant forgetting to
  // tick it billed the client the entire project fee on day one.
  const [depositOnly, setDepositOnly] = useState(true);
  // Consumer clients sign the consumer form of the agreement — the statutory
  // 14-day cancellation variant. Has to be set here, before generation:
  // by the time anyone reads the contract it is too late for it to change shape.
  const [isConsumer, setIsConsumer] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [emailingLink, setEmailingLink] = useState(false);
  const [linkEmailStatus, setLinkEmailStatus] = useState('');
  const [downloadingContract, setDownloadingContract] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState<'client' | 'self' | null>(null);
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [proposalError, setProposalError] = useState('');
  const [convertingToProject, setConvertingToProject] = useState(false);

  const proposalBreakdown = calculatePrice({
    baseService: proposalService,
    addOns: proposalAddOns,
    clientType: proposalClientType,
    timeline: proposalTimeline,
  });

  const toggleProposalAddOn = (key: AddOnKey) => {
    if (isIncludedInBase(proposalService, key)) return;
    setProposalAddOns((prev) => {
      if (prev.includes(key)) {
        const toRemove = new Set([key, ...dependentsOf(key, prev)]);
        return prev.filter((a) => !toRemove.has(a));
      }
      return expandAddOnDependencies([...prev, key]);
    });
  };

  const inputClass =
    'w-full px-4 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

  const followUpInputRef = useRef<HTMLInputElement>(null);
  const openFollowUpPicker = () => {
    const el = followUpInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.click();
  };

  const load = async () => {
    try {
      const response = await fetch(`/api/admin/leads/${leadId}`);
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      setLoadError(null);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        // Anything other than success used to leave `lead` null, and the
        // component renders a spinner whenever that's true — so a deleted
        // lead or a server error span forever with nothing to act on.
        setLoadError(
          response.status === 404
            ? "This lead no longer exists — it was probably deleted or re-imported."
            : data?.error || 'Could not load this lead. Try again in a moment.'
        );
        return;
      }
      if (data.success) {
        const l: LeadDetail = data.lead;
        setLead(l);
        setPlaybook(data.playbook ?? []);
        setDuplicates(data.possibleDuplicates ?? []);
        setDealProject(data.project ?? null);
        setCompany(l.company);
        setContactName(l.contactName || '');
        setEmail(l.email || '');
        setPhone(l.phone || '');
        setSource(l.source || '');
        setEstimatedValue(l.estimatedValue ? String(l.estimatedValue / 100) : '');
        setNotes(l.notes || '');
        setOriginalWebsite(l.originalWebsite || '');
        setSalesNote(l.salesNote || '');
        // The PDF field starts empty rather than pre-filled: attaching one
        // adds a version to the mockup list, so leaving the last URL sitting
        // in the box would invite re-submitting the same file as version two.
        setMockupPdfUrl('');
        setInvoicePdfUrl(l.invoicePdfUrl || '');
        setVercelDeployPassword(l.vercelDeployPassword || '');
        setPainPoints(
          l.painPoints
            .split(',')
            .filter(Boolean)
            .filter((p): p is PainPointKey => p in PAIN_POINTS)
        );
        setQualNeed(l.qualNeed || '');
        setQualAuthority(l.qualAuthority || '');
        setQualBudget(l.qualBudget || '');
        setQualTiming(l.qualTiming || '');
        setQualMotivation(l.qualMotivation || '');

        // Only on the very first load — later calls to load() happen after
        // unrelated actions (logging an activity, changing status) and must
        // never clobber whatever Evan is mid-way through typing into the
        // pricing builder.
        if (!hydratedProposalRef.current) {
          hydratedProposalRef.current = true;
          if (l.proposalBaseService && isBaseService(l.proposalBaseService)) {
            // A proposal already exists server-side — that's the source of
            // truth for what the client can actually see, so it wins over
            // any local draft.
            //
            // Rebuild the live link too, rather than only showing it in the
            // session where the proposal was generated: the link is what a
            // rep comes back for, and it's what the revoke button acts on.
            if (l.shareToken) {
              setPaymentLinkUrl(`${window.location.origin}/sign/${l.id}?t=${l.shareToken}`);
            }
            setProposalServiceRaw(l.proposalBaseService);
            setProposalAddOns(l.proposalAddOns.split(',').filter((a): a is AddOnKey => isAddOnKey(a)));
            if (l.proposalClientType && isClientType(l.proposalClientType)) setProposalClientType(l.proposalClientType);
            if (l.proposalTimeline && isTimelineKey(l.proposalTimeline)) setProposalTimeline(l.proposalTimeline);
            setDepositOnly(l.proposalDepositOnly);
            setCustomItems(sanitizeCustomItems(l.proposalCustomItems || []));
          } else {
            // Nothing sent yet — restore whatever was last typed into the
            // builder in case a crash or accidental navigation lost it.
            try {
              const raw = localStorage.getItem(`bothmade_proposal_draft_${leadId}`);
              const draft = raw ? JSON.parse(raw) : null;
              if (draft) {
                if (draft.baseService && isBaseService(draft.baseService)) setProposalServiceRaw(draft.baseService);
                if (Array.isArray(draft.addOns)) {
                  setProposalAddOns(draft.addOns.filter((a: string): a is AddOnKey => isAddOnKey(a)));
                }
                if (draft.clientType && isClientType(draft.clientType)) setProposalClientType(draft.clientType);
                if (draft.timeline && isTimelineKey(draft.timeline)) setProposalTimeline(draft.timeline);
                if (typeof draft.depositOnly === 'boolean') setDepositOnly(draft.depositOnly);
                if (Array.isArray(draft.customItems)) setCustomItems(sanitizeCustomItems(draft.customItems));
                setRestoredDraft(true);
              }
            } catch {
              // corrupt or inaccessible localStorage — nothing to restore, no big deal
            }
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  // Mirrors the builder to localStorage on every change, so a crashed tab or
  // an accidental back-button doesn't cost him the selections. Skipped until
  // hydration has actually run — otherwise the pre-hydration defaults
  // ('website', no add-ons) would overwrite a real draft in the first tick.
  useEffect(() => {
    if (!hydratedProposalRef.current) return;
    try {
      localStorage.setItem(
        `bothmade_proposal_draft_${leadId}`,
        JSON.stringify({
          baseService: proposalService,
          addOns: proposalAddOns,
          clientType: proposalClientType,
          timeline: proposalTimeline,
          depositOnly,
          customItems,
        })
      );
    } catch {
      // storage full or disabled — the draft is a convenience, not required
    }
  }, [leadId, proposalService, proposalAddOns, proposalClientType, proposalTimeline, depositOnly, customItems]);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const pendingFollowUp = (key: string) => {
    if (!lead?.email) return null;
    return buildFollowUpDraft(key, {
      company: lead.company,
      contactName: lead.contactName,
      essentials: parseSalesPoints(lead.essentialPoints),
      low: lead.estimateLowCents,
      high: lead.estimateHighCents,
    });
  };

  const sendFollowUp = async () => {
    if (!followUp) return;
    setSendingFollowUp(true);
    setFollowUpResult(null);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: followUp.subject, body: followUp.body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFollowUpResult(data.error || 'Could not send.');
        return;
      }
      setFollowUp(null);
      setFollowUpResult('Sent — it will be in your Sent folder.');
      load();
    } finally {
      setSendingFollowUp(false);
    }
  };

  const undoLastOutcome = async () => {
    if (!lastOutcome) return;
    setUndoing(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/call-outcome/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId: lastOutcome.activityId, previous: lastOutcome.previous }),
      });
      if (res.ok) {
        setLastOutcome(null);
        setFollowUp(null);
        setFollowUpResult(null);
        load();
      }
    } finally {
      setUndoing(false);
    }
  };

  const handleCallOutcome = async (key: string, needsDate: boolean) => {
    if (needsDate && !outcomeDate) return;
    setSavingOutcome(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/call-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome: key,
          note: outcomeNote,
          followUpAt: outcomeDate || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        const o = CALL_OUTCOMES.find((x) => x.key === key);
        if (data?.previous && data?.activityId && o) {
          const when = data.lead?.nextFollowUpAt
            ? new Date(data.lead.nextFollowUpAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
              })
            : null;
          setLastOutcome({
            label: o.label,
            summary: [
              o.status === 'lost' ? 'marked lost' : data.lead?.status ? `moved to ${LEAD_STATUS_LABELS[data.lead.status as LeadStatus]}` : null,
              when ? `follow-up set for ${when}` : 'no follow-up set',
              'note saved',
            ]
              .filter(Boolean)
              .join(' · '),
            activityId: data.activityId,
            previous: data.previous,
          });
        }
        setLoggingOutcome(null);
        setOutcomeNote('');
        setOutcomeDate('');
        setFollowUpResult(null);
        // Offer the follow-up straight away — the moment right after the call
        // is the only one where it reliably gets sent.
        setFollowUp(pendingFollowUp(key));
        load();
      }
    } finally {
      setSavingOutcome(false);
    }
  };

  const togglePainPoint = (key: PainPointKey) => {
    setPainPoints((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          contactName,
          email,
          phone,
          source,
          estimatedValue: estimatedValue ? Math.round(Number(estimatedValue) * 100) : null,
          notes,
          originalWebsite: originalWebsite.trim() || null,
          salesNote: salesNote.trim() || null,
          painPoints,
        }),
      });
      if (!res.ok) {
        // Leave the form open — closing it would discard the very edits
        // that just failed to store.
        setSaveError(SAVE_ERROR_MESSAGE);
        return;
      }
      setSaveError(null);
      setEditing(false);
      load();
    } catch {
      setSaveError(SAVE_ERROR_MESSAGE);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFiles = async () => {
    setSavingFiles(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mockupPdfUrl: mockupPdfUrl.trim() || null,
          invoicePdfUrl: invoicePdfUrl.trim() || null,
          vercelDeployPassword: vercelDeployPassword.trim() || null,
        }),
      });
      if (!res.ok) {
        setSaveError(SAVE_ERROR_MESSAGE);
        return;
      }
      setSaveError(null);
      load();
    } catch {
      setSaveError(SAVE_ERROR_MESSAGE);
    } finally {
      setSavingFiles(false);
    }
  };

  const [showChecklistPains, setShowChecklistPains] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  // The page serves three jobs at three different moments — read the brief
  // before ringing, log what happened during and after, build a proposal at a
  // desk days later. Stacked vertically that meant scrolling past a proposal
  // builder to reach a note field mid-call.
  //
  // The active tab is mirrored into the URL (?tab=call) so a refresh, the
  // back button, or a link pasted to a teammate lands on the same view
  // instead of resetting to the brief. Anything unrecognised falls back to
  // 'brief'. replace (not push) so tab-hopping doesn't bury the real
  // history, and scroll: false so switching tabs doesn't jump to the top.
  const isTabKey = (v: string | null): v is 'brief' | 'call' | 'proposal' =>
    v === 'brief' || v === 'call' || v === 'proposal';
  const [tab, setTabState] = useState<'brief' | 'call' | 'proposal'>(() => {
    const fromUrl = searchParams.get('tab');
    return isTabKey(fromUrl) ? fromUrl : 'brief';
  });
  const setTab = (next: 'brief' | 'call' | 'proposal') => {
    setTabState(next);
    const query = new URLSearchParams(searchParams.toString());
    query.set('tab', next);
    router.replace(`?${query.toString()}`, { scroll: false });
  };
  // Tracks what's been collapsed, not what's been expanded: every item shows
  // its full coaching detail by default, because a rep new to this needs the
  // words in front of him, not one tap away.
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [foldedSteps, setFoldedSteps] = useState<Set<number>>(new Set());
  const [showScript, setShowScript] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);

  // This page reloads from the server rather than holding a local list, so
  // the hook does no optimistic write here — just the PATCH, the rollback-free
  // refresh, and the shared "lost needs a reason" gate.
  const {
    changeStatus,
    lostTarget: pendingLostStatus,
    confirmLost: handleConfirmLost,
    cancelLost,
    error: statusError,
  } = useLeadStatusChange<{ id: string; company: string; status: LeadStatus }>({
    onSaved: () => load(),
  });

  const handleStatusChange = (status: LeadStatus) => {
    if (!lead) return;
    changeStatus({ id: lead.id, company: lead.company, status: lead.status }, status);
  };

  const [requestingMockup, setRequestingMockup] = useState(false);

  const handleRequestMockup = async () => {
    setRequestingMockup(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockupRequested: true }),
      });
      if (!res.ok) {
        setSaveError(SAVE_ERROR_MESSAGE);
        return;
      }
      setSaveError(null);
      load();
    } catch {
      setSaveError(SAVE_ERROR_MESSAGE);
    } finally {
      setRequestingMockup(false);
    }
  };

  const [sendingMockup, setSendingMockup] = useState(false);
  const [mockupSendNotice, setMockupSendNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(
    null
  );

  /**
   * The whole job in one press: take the folder link, make a tracked version
   * of it, mail it, stamp the record, move the stage. What it will not do is
   * send the preview build — the route refuses, because that link is behind
   * a Vercel password and the client would hit a wall.
   */
  const handleSendMockup = async (email?: string, kind?: MockupKind) => {
    setSendingMockup(true);
    setMockupSendNotice(null);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/send-mockup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(email ? { email } : {}), ...(kind ? { kind } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMockupSendNotice({ tone: 'warn', text: data.error || 'Could not send it.' });
        return;
      }
      setMockupSendNotice(
        data.sent
          ? {
              tone: 'ok',
              text: `Sent to ${data.sentTo}.${
                data.emailUpdated ? ' That is now this lead\u2019s address.' : ''
              } You'll see here when they open it.`,
            }
          : {
              tone: 'warn',
              text: `Link is ready but the email did not send${
                data.reason ? ` — ${data.reason}` : ''
              }. Copy it and send it yourself.`,
            }
      );
      load();
    } catch {
      setMockupSendNotice({ tone: 'warn', text: 'Could not reach the server — try again.' });
    } finally {
      setSendingMockup(false);
    }
  };

  const handleSaveQualification = async () => {
    setSavingQual(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qualNeed,
          qualAuthority,
          qualBudget,
          qualTiming,
          qualMotivation,
        }),
      });
      if (!res.ok) {
        setSaveError(SAVE_ERROR_MESSAGE);
        return;
      }
      setSaveError(null);
      load();
    } catch {
      setSaveError(SAVE_ERROR_MESSAGE);
    } finally {
      setSavingQual(false);
    }
  };

  const [confirmingDeleteLead, setConfirmingDeleteLead] = useState(false);
  const [deletingLead, setDeletingLead] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

  const handleSendColdDraft = async () => {
    if (!lead) return;
    // A second send is a real thing to want — the first one went to a shared
    // inbox, or the draft has been rewritten since — but it is also the one
    // mistake that cannot be taken back, so the prompt says when the last one
    // went rather than asking the same bland question twice.
    const already = lead.coldEmailSentAt || coldDraftSent;
    const lastSent = lead.coldEmailSentAt
      ? new Date(lead.coldEmailSentAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      : 'today';
    const question = already
      ? `A cold email already went to ${lead.company} on ${lastSent}. Send it again to ${lead.email}?`
      : `Send the prepared cold email to ${lead.company} now?`;
    if (!confirm(question)) return;
    setSendingColdDraft(true);
    try {
      const res = await fetch('/api/admin/email/send-cold-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: [leadId] }),
      });
      if (res.ok) {
        setColdDraftSent(true);
        load();
      }
    } finally {
      setSendingColdDraft(false);
    }
  };

  const handleDeleteLead = async () => {
    setDeletingLead(true);
    try {
      const response = await fetch(`/api/admin/leads/${leadId}`, { method: 'DELETE' });
      if (response.ok) router.push('/admin/sales?view=list');
    } finally {
      setDeletingLead(false);
    }
  };

  const handleToggleHot = async () => {
    if (!lead) return;
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hotLead: !lead.hotLead }),
      });
      if (!res.ok) {
        setSaveError(SAVE_ERROR_MESSAGE);
        return;
      }
      setSaveError(null);
      load();
    } catch {
      setSaveError(SAVE_ERROR_MESSAGE);
    }
  };

  const handleClearEmailFailure = async () => {
    await fetch(`/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearEmailFailure: true }),
    });
    load();
  };

  const handleSetContractStatus = async (contractStatus: LeadDetail['contractStatus']) => {
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractStatus }),
      });
      if (!res.ok) {
        setSaveError(SAVE_ERROR_MESSAGE);
        return;
      }
      setSaveError(null);
      load();
    } catch {
      setSaveError(SAVE_ERROR_MESSAGE);
    }
  };

  const handleSetFollowUp = async (dateStr: string) => {
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextFollowUpAt: dateStr || null }),
      });
      if (!res.ok) {
        setSaveError(SAVE_ERROR_MESSAGE);
        return;
      }
      setSaveError(null);
      load();
    } catch {
      setSaveError(SAVE_ERROR_MESSAGE);
    }
  };

  const [loopMessage, setLoopMessage] = useState('');
  const [loopUrgent, setLoopUrgent] = useState(false);
  const [loopSending, setLoopSending] = useState(false);
  const [loopStatus, setLoopStatus] = useState('');

  const handleLoopIn = async () => {
    if (!loopMessage.trim()) return;
    setLoopSending(true);
    setLoopStatus('');
    try {
      const response = await fetch('/api/admin/team-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `Re: ${lead?.company} — ${loopMessage.trim()}`,
          relatedLeadId: leadId,
          urgent: loopUrgent,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setLoopMessage('');
        setLoopUrgent(false);
        setLoopStatus('Sent to the team chat.');
      }
    } finally {
      setLoopSending(false);
    }
  };

  const handleLogActivity = async () => {
    if (!activityContent.trim()) return;
    setLoggingActivity(true);
    setActivityMessage('');
    try {
      const response = await fetch(`/api/admin/leads/${leadId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activityType,
          content: activityContent,
          url: activityUrl || undefined,
          sendEmailNow: activityType === 'email' && sendEmailNow,
          emailSubject,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setActivityContent('');
        setActivityUrl('');
        setEmailSubject('');
        setActivityMessage(data.emailSent ? 'Logged and email sent.' : 'Logged.');
        load();
      } else {
        setActivityMessage(data.error || 'Failed to log activity');
      }
    } catch {
      setActivityMessage("No connection — your note is saved, try again when back online.");
    } finally {
      setLoggingActivity(false);
    }
  };

  const proposalSelection = {
    baseService: proposalService,
    addOns: proposalAddOns,
    clientType: proposalClientType,
    timeline: proposalTimeline,
    customItems,
  };

  const proposalCustomTotal = customItemsTotal(customItems);
  const proposalGrandTotal = proposalBreakdown.totalPrice + proposalCustomTotal;

  // A link has gone out (or at least been generated) the moment a proposal
  // is saved on the lead — before that there's nothing for "changed since
  // sending" to compare against.
  // Kills every sign-and-pay link already sent for this lead and issues a
  // fresh one. For the case where a proposal went to the wrong address, or a
  // deal went cold and shouldn't still open a priced contract.
  const handleRevokeLink = async () => {
    if (!lead) return;
    if (!confirm('Revoke the current sign & pay link?\n\nAny link already emailed for this lead will stop working immediately. You will get a new one to send.')) return;
    setRevokingLink(true);
    setRevokeNote('');
    try {
      const res = await fetch('/api/share-links/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'lead', id: leadId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPaymentLinkUrl(data.url);
        setRevokeNote('Old links revoked. Send the new one below.');
        load();
      } else {
        setRevokeNote(data.error || "Couldn't revoke that link — try again.");
      }
    } catch {
      setRevokeNote('Something went wrong revoking the link.');
    } finally {
      setRevokingLink(false);
    }
  };

  const hasSentProposal = Boolean(lead?.proposalBaseService);
  const sameAddOns = (a: AddOnKey[], b: string) => {
    const bSet = new Set(b.split(',').filter(Boolean));
    return a.length === bSet.size && a.every((k) => bSet.has(k));
  };
  const sameCustomItems = (a: CustomItem[], b?: LeadDetail['proposalCustomItems']) => {
    const bItems = b || [];
    if (a.length !== bItems.length) return false;
    // Description included deliberately: rewording what a custom item covers
    // changes the scope the client agreed to, even when the name and price
    // are untouched, so it has to count as "changed since sent".
    return a.every(
      (item, i) =>
        item.label === bItems[i]?.label &&
        item.priceCents === bItems[i]?.priceCents &&
        item.description === (bItems[i]?.description ?? '')
    );
  };
  const proposalChangedSinceSent =
    hasSentProposal &&
    lead &&
    (proposalService !== lead.proposalBaseService ||
      !sameAddOns(proposalAddOns, lead.proposalAddOns) ||
      proposalClientType !== lead.proposalClientType ||
      proposalTimeline !== lead.proposalTimeline ||
      depositOnly !== lead.proposalDepositOnly ||
      !sameCustomItems(customItems, lead.proposalCustomItems));

  // One plain-English sentence for "what do I actually do next with this
  // lead" — removes the need to piece it together from contract status,
  // agreement timestamp, and pipeline stage separately.
  const nextStepMessage: string | null = (() => {
    if (!lead) return null;
    if (lead.status === 'won') return null;
    if (lead.status === 'lost') return null;
    if (lead.agreementSignedAt) {
      return "Next: they've signed and paid — hit \"Convert to Project\" below to kick off onboarding.";
    }
    if (customScopeBlocked) {
      return `Next: say what the custom work covers (${customItemsNeedingScope
        .map((c) => `"${c.label}"`)
        .join(', ')}) — the contract can't be generated until it's written down.`;
    }
    if (hasSentProposal && lead.contractStatus === 'sent') {
      return proposalChangedSinceSent
        ? "Next: you've changed the scope since this went out — send it again so the client sees the update."
        : 'Next: waiting on the client to review and sign. Nothing to do until they act, or follow up if it\'s been a few days.';
    }
    return 'Next: build the proposal below, then click "Email Sign & Pay Link" to send it to the client.';
  })();

  // True once there's something in the builder worth not losing — either a
  // proposal that's diverged from what was actually sent, or real progress
  // on one that's never been saved at all.
  const hasUnsentProposalChanges = Boolean(
    hydratedProposalRef.current &&
      (proposalChangedSinceSent ||
        (!hasSentProposal &&
          (proposalAddOns.length > 0 ||
            customItems.length > 0 ||
            proposalService !== 'website' ||
            proposalClientType !== 'smb' ||
            proposalTimeline !== 'standard' ||
            depositOnly)))
  );

  // A second safety net alongside the draft autosave — closing the tab or
  // navigating away with unsent changes gets an explicit browser prompt,
  // not just a silent trust that the draft will be there next time.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsentProposalChanges) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsentProposalChanges]);

  const handleCreatePaymentLink = async () => {
    setProposalError('');
    setCreatingLink(true);
    try {
      const response = await fetch(`/api/admin/leads/${leadId}/proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...proposalSelection, depositOnly, isConsumer }),
      });
      const data = await response.json();
      if (data.success) {
        setPaymentLinkUrl(data.signUrl);
        clearProposalDraft();
        load();
      } else {
        setProposalError(data.error || 'Something went wrong generating this link — try again in a moment.');
      }
    } catch {
      setProposalError('Could not reach the server — check your internet connection and try again.');
    } finally {
      setCreatingLink(false);
    }
  };

  // Clicking "Email Sign & Pay Link" opens an inline confirmation instead of
  // sending immediately — a wrong price or scope going straight to the
  // client's inbox isn't something to find out about after the fact.
  const [confirmingSend, setConfirmingSend] = useState(false);

  const doEmailPaymentLink = async () => {
    setConfirmingSend(false);
    setProposalError('');
    setLinkEmailStatus('');
    setEmailingLink(true);
    try {
      const response = await fetch(`/api/admin/leads/${leadId}/proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...proposalSelection, depositOnly, isConsumer, sendEmail: true }),
      });
      const data = await response.json();
      if (data.success) {
        setPaymentLinkUrl(data.signUrl);
        if (!data.hasEmail) {
          setLinkEmailStatus('Link created, but this lead has no email on file — add one to send it directly.');
        } else if (data.emailSent && !data.emailError) {
          setLinkEmailStatus(`Sent to ${lead?.email}, with the agreement and invoice attached.`);
        } else if (data.emailSent) {
          // Went out, but short of a document — say which, before the client asks.
          setLinkEmailStatus(`Sent to ${lead?.email}. ${data.emailError}`);
        } else {
          // The server now says *why*. "Failed to send" left a rep with no
          // idea whether to retry, fix a setting, or ring the client.
          setLinkEmailStatus(
            data.emailError
              ? `Not sent — ${data.emailError} The link below still works.`
              : 'Link created, but the email failed to send — copy it manually below.'
          );
        }
        clearProposalDraft();
        load();
      } else {
        setProposalError(data.error || 'Something went wrong sending this — try again in a moment.');
      }
    } catch {
      setProposalError('Could not reach the server — check your internet connection and try again.');
    } finally {
      setEmailingLink(false);
    }
  };

  const handleSendInvoice = async (recipient: 'client' | 'self') => {
    setProposalError('');
    setInvoiceStatus('');
    setSendingInvoice(recipient);
    try {
      const response = await fetch(`/api/admin/leads/${leadId}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...proposalSelection, depositOnly, isConsumer, recipient }),
      });
      const data = await response.json();
      if (data.success && data.sent) {
        setInvoiceStatus(`Invoice emailed to ${data.toEmail}.`);
      } else {
        setProposalError(data.error || 'Something went wrong sending the invoice — try again in a moment.');
      }
    } catch {
      setProposalError('Could not reach the server — check your internet connection and try again.');
    } finally {
      setSendingInvoice(null);
    }
  };

  const handleDownloadContract = async () => {
    setProposalError('');
    setDownloadingContract(true);
    try {
      const response = await fetch(`/api/admin/leads/${leadId}/contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposalSelection),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setProposalError(data.error || 'Something went wrong generating the contract — try again in a moment.');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lead?.company.replace(/[^a-z0-9]/gi, '-') || 'contract'}-contract.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      load();
    } catch {
      setProposalError('Could not reach the server — check your internet connection and try again.');
    } finally {
      setDownloadingContract(false);
    }
  };

  const handleConvertToProject = () => {
    if (!lead) return;
    const query = new URLSearchParams({
      company: lead.company,
      contactName: lead.contactName || '',
      clientEmail: lead.email || '',
      phone: lead.phone || '',
      baseService: proposalService,
      addOns: proposalAddOns.join(','),
      clientType: proposalClientType,
      timeline: proposalTimeline,
      customItems: JSON.stringify(customItems),
      leadId,
    });
    setConvertingToProject(true);
    router.push(`/admin/projects/new?${query.toString()}`);
  };

  if (!loading && loadError) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <AlertTriangle size={26} className="text-amber-400 mx-auto mb-3" />
        <p className="text-sm text-white/70 leading-relaxed">{loadError}</p>
        <div className="flex items-center justify-center gap-2 mt-5">
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/admin/sales?view=list"
            className="rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
          >
            Back to Leads
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !lead) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </div>
    );
  }

  // A mockup that arrived as a file rather than a link is the downloadable
  // copy — the one that still opens with no signal and no password. The list
  // comes back newest first, so the first match is the current one.
  const latestMockupPdf = lead.mockups.find((m) => m.fileName)?.url ?? null;

  const qualAnswered = [qualNeed, qualAuthority, qualBudget, qualTiming, qualMotivation].filter(
    (v) => v.trim()
  ).length;

  /**
   * What the Mockups section says while it is shut, and whether it opens.
   *
   * A collapsed box labelled "Mockups" is a question you have to open the box
   * to answer, which is no better than the endless scroll it replaced. This
   * is the answer: where the mockup is, in the words that decide what you do
   * next. Sent-and-opened is a reason to ring today; requested-and-waiting is
   * a reason to chase the designer; nothing at all is a reason to ask for one.
   *
   * It opens by itself only when somebody is being kept waiting — which is
   * the one state where the detail underneath is worth the space.
   */
  const mockupSummary = (() => {
    const sent = lead.mockups.find((m) => m.sentAt);
    const built = lead.mockups.length > 0 || !!lead.mockupFolderUrl;

    if (sent) {
      const views = sent.viewCount ?? 0;
      return {
        open: false,
        attention: false,
        line: `Sent ${new Date(sent.sentAt as string).toLocaleDateString()} · ${
          views > 0
            ? `opened ${views} ${views === 1 ? 'time' : 'times'} — worth a call`
            : 'not opened yet'
        }`,
      };
    }
    if (lead.mockupSentManuallyAt) {
      return {
        open: false,
        attention: false,
        line: `Sent by hand on ${new Date(lead.mockupSentManuallyAt).toLocaleDateString()}.`,
      };
    }
    if (built) {
      // The trap worth shouting about: the work is done and the client has
      // never seen it. One click from finished, and invisible until now.
      return { open: true, attention: true, line: 'Built and never sent — it is one click away.' };
    }
    if (lead.mockupRequested) {
      const days = lead.mockupRequestedAt
        ? Math.floor((Date.now() - new Date(lead.mockupRequestedAt).getTime()) / 86_400_000)
        : 0;
      return {
        open: days >= 5,
        attention: days >= 5,
        line: `Asked for ${days === 0 ? 'today' : `${days} days ago`} — nobody has built it yet.`,
      };
    }
    return { open: false, attention: false, line: 'None asked for, none built.' };
  })();

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/sales?view=list"
          className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm transition-colors"
        >
          ← Back to Leads
        </Link>
        <div className="flex items-center gap-2">
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              title="Call"
              aria-label={`Call ${lead.company}`}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-400/10 border border-amber-400/25 text-amber-300 hover:bg-amber-400/20 transition-colors"
            >
              <Phone size={15} />
            </a>
          )}
          {/*
            Sending once used to remove this button for good, which made the
            most ordinary follow-up in the job impossible: the first email went
            to an info@ nobody reads, or the draft has been rewritten since, and
            the only way to send again was the composer and a hand-typed email.
            The bulk send on the leads list never had that restriction, so the
            same action was available for fifty leads at once and not for one.

            It comes back once a lead is contacted. What changes is the tone —
            amber rather than green, and a prompt that says when the last one
            went — because the button's job is now "again", not "yet".
          */}
          {lead.email &&
            lead.coldEmailDraft &&
            !lead.doNotContact &&
            lead.status !== 'won' &&
            lead.status !== 'lost' &&
            (() => {
              const already = Boolean(lead.coldEmailSentAt) || coldDraftSent;
              return (
                <button
                  onClick={handleSendColdDraft}
                  disabled={sendingColdDraft}
                  title={already ? 'Send the cold email again' : 'Send cold email'}
                  aria-label={already ? 'Send the cold email again' : 'Send cold email'}
                  className={`flex items-center justify-center w-9 h-9 rounded-full border disabled:opacity-50 transition-colors ${
                    already
                      ? 'bg-amber-400/10 border-amber-400/25 text-amber-300 hover:bg-amber-400/20'
                      : 'bg-emerald-400/10 border-emerald-400/25 text-emerald-300 hover:bg-emerald-400/20'
                  }`}
                >
                  {already ? <RefreshCw size={15} /> : <Send size={15} />}
                </button>
              );
            })()}
          {(lead.coldEmailSentAt || coldDraftSent) &&
            (() => {
              // "Sent" was all this said, which is the least interesting half
              // of the story — whether anybody opened it is the half that
              // decides whether to ring them today.
              const reading = readOpens(lead);
              if (reading.opens === 0) {
                return (
                  <span
                    title={`Cold email sent. ${reading.headline}${reading.nextStep ? ` — ${reading.nextStep}` : ''}`}
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-300/70"
                  >
                    <CheckCircle2 size={15} />
                  </span>
                );
              }
              const hot = reading.band === 'hot';
              return (
                <span
                  title={`${reading.headline}${reading.nextStep ? ` — ${reading.nextStep}` : ''}`}
                  className={`flex items-center gap-1 h-9 px-3 rounded-full border text-xs font-semibold ${
                    hot
                      ? 'bg-orange-400/15 border-orange-400/35 text-orange-200'
                      : 'bg-emerald-400/10 border-emerald-400/20 text-emerald-300/80'
                  }`}
                >
                  <Eye size={14} /> {reading.opens}×
                </span>
              );
            })()}
          <button
            onClick={() => setComposingEmail(true)}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-gradient-to-r from-sky-400 to-purple-500 text-black hover:opacity-90 transition-opacity"
          >
            <Mail size={14} /> Compose email
          </button>

          <div
            // z-40 lifts the whole popover subtree above the sticky tab bar
            // below (z-30) — without it the tab bar's backdrop-blur paints
            // over the open menu and smears the delete button unreadable.
            className="relative z-40"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && actionsMenuOpen) {
                e.stopPropagation();
                setActionsMenuOpen(false);
                setConfirmingDeleteLead(false);
              }
            }}
          >
            <button
              onClick={() => setActionsMenuOpen((v) => !v)}
              title="More actions"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={actionsMenuOpen}
              className={`flex items-center justify-center w-9 h-9 rounded-full border transition-colors ${
                actionsMenuOpen ? 'border-white/30 bg-white/10' : 'border-white/15 hover:bg-white/5'
              }`}
            >
              <MoreVertical size={15} aria-hidden="true" />
            </button>
            {actionsMenuOpen && (
              <>
                {/* Click-outside catcher. aria-hidden so it isn't announced
                    as an empty region sitting over the whole page. */}
                <div aria-hidden="true" className="fixed inset-0 z-10" onClick={() => setActionsMenuOpen(false)} />
                <div
                  role="menu"
                  aria-label="Lead actions"
                  className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-white/10 bg-[#0b0714] shadow-xl z-20 p-1.5"
                >
                  {confirmingDeleteLead ? (
                    <div className="p-2">
                      <p className="text-xs text-white/50 mb-2">Delete {lead.company} permanently?</p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleDeleteLead}
                          disabled={deletingLead}
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-semibold disabled:opacity-50 hover:bg-red-500 transition-colors"
                        >
                          {deletingLead ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setConfirmingDeleteLead(false)}
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-white/15 text-xs hover:bg-white/5 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      role="menuitem"
                      onClick={() => setConfirmingDeleteLead(true)}
                      className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-sm text-red-300/80 hover:bg-red-400/10 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={14} aria-hidden="true" /> Delete lead
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {duplicates.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.09] p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-100">
            <AlertTriangle size={14} /> This business may already be in here twice
          </p>
          <p className="text-xs text-amber-100/70 mt-1 leading-relaxed">
            Check before you ring — someone may have spoken to them already under the other record.
          </p>
          <div className="mt-2.5 space-y-1.5">
            {duplicates.map((d) => (
              <Link
                key={d.id}
                href={`/admin/leads/${d.id}`}
                className="block rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/[0.08] transition-colors break-words"
              >
                {d.company} — {LEAD_STATUS_LABELS[d.status as LeadStatus] ?? d.status} →
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Where this deal actually is, above the tabs, because "where is this?"
          is the question asked of a deal more than any other and answering it
          used to mean assembling four screens in your head. */}
      <DealTimeline
        className="mt-4"
        projectId={dealProject?.id ?? null}
        lead={{
          status: lead.status,
          contractStatus: lead.contractStatus,
          coldEmailSentAt: lead.coldEmailSentAt ?? null,
          agreementSignedAt: lead.agreementSignedAt ?? null,
          proposalTotalPrice: lead.proposalTotalPrice ?? null,
          latestMockupAt: lead.mockups?.[0]?.createdAt ?? lead.mockupDeliveredAt ?? null,
          activities: lead.activities.map((a) => ({ type: a.type, createdAt: a.createdAt })),
          project: dealProject,
        }}
      />

      <div className="sticky top-14 lg:top-0 z-30 -mx-4 md:-mx-8 px-4 md:px-8 pt-3 pb-0 mt-3 bg-[#050505]/90 backdrop-blur border-b border-white/[0.06]">
        <div className="flex gap-1 overflow-x-auto">
          {(
            [
              ['brief', 'Brief', 'Read this before you ring'],
              ['call', 'The call', 'Log what happened'],
              ['proposal', 'Proposal', 'Price it up and send'],
            ] as Array<['brief' | 'call' | 'proposal', string, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === key
                  ? 'border-sky-400 text-white'
                  : 'border-transparent text-white/45 hover:text-white/75'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-white/30 mt-3 mb-1">
        {tab === 'brief'
          ? "Everything about this business, and what to say. Read it, then switch to The call."
          : tab === 'call'
            ? 'Log the call, add notes, ask for a mockup.'
            : 'Build the quote and send it. Usually done after the call, not during.'}
      </p>

      {/* One shared failure line for the quick saves scattered across all
          three tabs (edit form, files, qualification, follow-up, hot star,
          contract status, mockup request). Near the top so it's visible no
          matter which card the failed save came from. */}
      {saveError && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200"
        >
          {saveError}
        </p>
      )}

      {/* Post-call wrap-up — first thing on the call tab, because this is what
          the rep reaches for the second they hang up. */}
      {tab === 'call' && (
      <div
        id="log-the-call"
        className="mt-4 scroll-mt-20 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-bold text-white/85">Just got off the phone?</p>
          {/* The dedicated calling screen for this lead — script, timer and
              outcome logging in one place, for when the quick buttons below
              aren't enough. */}
          <Link
            href={`/admin/call/${leadId}`}
            className="shrink-0 text-xs font-semibold text-sky-300 hover:text-sky-200 transition-colors whitespace-nowrap"
          >
            Open in Call HQ →
          </Link>
        </div>
        <p className="text-xs text-white/40 mt-0.5 mb-3.5">
          Tap what happened. It writes the note, moves the status and books the next follow-up in one go.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CALL_OUTCOMES.map((o) => {
            const active = loggingOutcome === o.key;
            const tone =
              o.tone === 'good'
                ? 'border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-100 hover:bg-emerald-400/15'
                : o.tone === 'bad'
                  ? 'border-red-400/25 bg-red-400/[0.06] text-red-100 hover:bg-red-400/15'
                  : 'border-white/12 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]';
            return (
              <button
                key={o.key}
                onClick={() => {
                  setLoggingOutcome(active ? null : o.key);
                  setOutcomeNote('');
                  setOutcomeDate('');
                }}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${tone} ${
                  active ? 'ring-2 ring-sky-400/60' : ''
                }`}
              >
                <span className="block text-xs font-bold leading-snug">{o.label}</span>
                <span className="block text-[10px] text-white/40 leading-snug mt-0.5">{o.hint}</span>
              </button>
            );
          })}
        </div>

        {lastOutcome && (
          <div className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-emerald-100 break-words">
                  Logged: {lastOutcome.label}
                </p>
                <p className="text-xs text-emerald-200/70 mt-0.5 leading-relaxed break-words">
                  {lastOutcome.summary}
                </p>
              </div>
              <button
                onClick={undoLastOutcome}
                disabled={undoing}
                className="shrink-0 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                {undoing ? 'Undoing...' : 'Undo'}
              </button>
            </div>
            <p className="text-[11px] text-emerald-200/45 mt-2 leading-relaxed">
              Tapped the wrong one? Undo puts everything back exactly as it was.
            </p>
          </div>
        )}

        {followUpResult && (
          <p className="mt-3 text-xs text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2">
            {followUpResult}
          </p>
        )}

        {followUp && (
          <div className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-3.5">
            <p className="text-sm font-bold text-emerald-100">Send the follow-up now</p>
            <p className="text-xs text-emerald-200/60 mt-0.5 mb-3 leading-relaxed">{followUp.why}</p>

            <label className="block text-[11px] uppercase tracking-wide text-emerald-300/70 mb-1.5">Subject</label>
            <input
              value={followUp.subject}
              onChange={(e) => setFollowUp({ ...followUp, subject: e.target.value })}
              className={`${inputClass} text-sm`}
            />

            <label className="block text-[11px] uppercase tracking-wide text-emerald-300/70 mt-3 mb-1.5">
              Message — read it before you send, and change anything that isn't true
            </label>
            <textarea
              value={followUp.body}
              onChange={(e) => setFollowUp({ ...followUp, body: e.target.value })}
              rows={12}
              className={`${inputClass} text-sm resize-y font-normal`}
            />

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setFollowUp(null)}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Not now
              </button>
              <button
                onClick={sendFollowUp}
                disabled={sendingFollowUp}
                className="flex-1 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {sendingFollowUp ? 'Sending...' : `Send it to ${lead.email}`}
              </button>
            </div>
          </div>
        )}

        {loggingOutcome && (() => {
          const o = CALL_OUTCOMES.find((x) => x.key === loggingOutcome)!;
          const needsDate = !!o.askForDate;
          return (
            <div className="mt-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.06] p-3.5">
              <textarea
                value={outcomeNote}
                onChange={(e) => setOutcomeNote(e.target.value)}
                placeholder="Anything worth remembering? What they said, what they care about, who to ask for next time..."
                rows={2}
                className={`${inputClass} resize-none text-sm`}
              />
              <div className="mt-2.5">
                <label className="block text-[11px] uppercase tracking-wide text-sky-300/70 mb-1.5">
                  {needsDate ? 'When? (required)' : 'Next follow-up'}
                </label>
                <input
                  type="date"
                  value={outcomeDate}
                  onChange={(e) => setOutcomeDate(e.target.value)}
                  className={`${inputClass} text-sm`}
                />
                {!needsDate && (
                  <p className="text-[11px] text-white/35 mt-1">
                    {o.followUpDays !== null
                      ? `Leave blank and it'll set one for ${o.followUpDays} days' time.`
                      : "Leave blank and no follow-up is set."}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleCallOutcome(o.key, needsDate)}
                disabled={savingOutcome || (needsDate && !outcomeDate)}
                className="w-full mt-3 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {savingOutcome ? 'Saving...' : `Log it — ${o.label.toLowerCase()}`}
              </button>
            </div>
          );
        })()}
      </div>

      )}

      {composingEmail && (
        <EmailComposer
          recipientEmail={lead.email || ''}
          recipientName={lead.contactName || undefined}
          company={lead.company}
          defaultLoomUrl={lead.mockupFolderUrl}
          defaultPainPoint={painPointSentence(lead.painPoints)}
          defaultObservation={lead.personalizedObservation}
          leadId={leadId}
          leadShareToken={lead.shareToken}
          onClose={() => setComposingEmail(false)}
        />
      )}

      {tab === 'brief' && (() => {
        // Hand-written content from the research CSV always wins over the
        // generic heuristics — a human who actually looked at the business
        // beats a lookup table. The heuristics stay as the fallback (and, for
        // pain points, as extra call scripts underneath).
        const writtenPains = parseSalesPoints(lead.customPainPoints);
        const writtenNeeds = parseSalesPoints(lead.essentialPoints);
        const writtenUpsell = parseSalesPoints(lead.upsellPoints);

        // Guessing at pain points from notes exists to fill a vacuum. Once
        // someone has written five bespoke ones for this business, keyword
        // matching has nothing to add and everything to get wrong.
        const inferred = writtenPains.length > 0 ? [] : inferPainPointsFromNotes(lead.notes, painPoints);
        const allPains = [...painPoints, ...inferred];
        const recs = buildSalesRecommendations(allPains);
        const base = BASE_SERVICES[recs.baseService];

        // Only define the words that actually appear in THIS lead's brief —
        // a fixed glossary of everything would be noise on a phone.
        const glossary = findGlossaryTerms(
          lead.currentSiteAssessment,
          lead.salesNote,
          lead.customPainPoints,
          lead.essentialPoints,
          lead.upsellPoints
        );

        // A checklist pain point already covered by a bespoke one would show
        // the same problem twice with the same script attached.
        const coveredByWritten = new Set(
          writtenPains.map((p) => classifyWrittenPoint(p.point, p.explanation)).filter(Boolean)
        );
        const checklistPains = allPains.filter((k) => !coveredByWritten.has(k));

        const playbookMap = new Map(playbook.map((e) => [e.slug, e]));
        const useWrittenNeeds = writtenNeeds.length > 0;
        const useWrittenUpsell = writtenUpsell.length > 0;
        const hasRange = lead.estimateLowCents !== null || lead.estimateHighCents !== null;
        const anything =
          writtenPains.length > 0 || allPains.length > 0 || useWrittenNeeds || useWrittenUpsell || hasRange;

        const low = lead.estimateLowCents ?? recs.coreTotal;
        const high = lead.estimateHighCents ?? recs.maxTotal;

        // Essentials add up to the low figure, upsells make up the rest to the
        // high figure, so the itemised column always agrees with the headline.
        // The derived path used to render a stripped-down card with no plain
        // English, no words to say and no note box — so any lead imported
        // without dossier columns gave the rep none of the help. Same card
        // for both now: where the playbook has no row for a catalogue add-on,
        // one is built from the add-on's own copy, whose benefit line is
        // already written addressed to the customer and reads as a pitch.
        const asPricedItem = (
          it: { key: AddOnKey; label: string; description: string; price: number; becauseOf: string[] },
          kind: 'essential' | 'upsell'
        ): PricedItem => {
          const fromPlaybook = playbookMap.get(it.key.replace(/[^a-z0-9]/g, ''));
          return {
            point: it.label,
            explanation: it.becauseOf.length
              ? `${kind === 'essential' ? 'Needed because' : 'Worth pitching because'}: ${it.becauseOf
                  .join(', ')
                  .toLowerCase()}`
              : null,
            priceCents: it.price,
            entry:
              fromPlaybook ?? {
                slug: it.key,
                label: it.label,
                kind,
                priceCents: it.price,
                whatItIs: it.description,
                benefit: '',
                pitch: ADD_ONS[it.key]?.benefit ?? '',
                justification: '',
                objection: null,
              },
          };
        };

        const pricedNeeds = priceToTotal(writtenNeeds, playbookMap, hasRange ? low : null);
        const pricedUpsell = priceToTotal(writtenUpsell, playbookMap, hasRange ? Math.max(0, high - low) : null);

        const callScript = buildCallScript({
          company: lead.company,
          contactName: lead.contactName,
          repName: lead.assignedTo?.name ?? null,
          writtenPains:
            writtenPains.length > 0
              ? writtenPains
              : checklistPains.map((k) => ({
                  point: PAIN_POINTS[k],
                  explanation: PAIN_POINT_BRIEFS[k]?.problem ?? null,
                })),
          checklistPainKeys: checklistPains,
          essentials: useWrittenNeeds
            ? writtenNeeds
            : recs.needs.map((n) => ({ point: n.label, explanation: n.description })),
          upsells: useWrittenUpsell
            ? writtenUpsell
            : recs.upsell.map((n) => ({ point: n.label, explanation: n.description })),
          low,
          high,
        });

        const stepOpen = (n: number) => !foldedSteps.has(n);

        // Everything the module-scope SectionNote needs from this page's
        // state, built once per render so the three direct call sites and
        // PricedCard (which forwards it) can't drift apart.
        const sectionNoteShared: SectionNoteSharedProps = {
          activities: lead.activities,
          drafts: sectionNoteDrafts,
          setDrafts: setSectionNoteDrafts,
          objection: sectionNoteObjection,
          setObjection: setSectionNoteObjection,
          saving: sectionNoteSaving,
          justLogged: sectionNoteJustLogged,
          error: sectionNoteError,
          onLog: handleLogSectionNote,
        };

        return (
          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-4 sm:p-6 min-w-0">
            <div className="mb-5">
              <h2 className="text-base font-bold">Your brief for {lead.company}</h2>

              {/* Who you are actually calling, and on what number, at the top
                  where you look — not buried in a card further down the tab.
                  Every one of these is a live link because the moment you
                  need them is the moment you are already dialling. */}
              {(lead.contactName || lead.phone || lead.email) && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  {lead.contactName && (
                    <span className="font-semibold text-white/85">{lead.contactName}</span>
                  )}
                  {lead.contactRole && <span className="text-white/35">{lead.contactRole}</span>}
                  {lead.phone && (
                    <a
                      href={`tel:${lead.phone}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1 text-white/70 hover:border-sky-400/40 hover:text-sky-300 transition-colors"
                    >
                      <Phone size={11} />
                      {lead.phone}
                    </a>
                  )}
                  {lead.email && (
                    <a
                      href={`mailto:${lead.email}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1 text-white/70 hover:border-sky-400/40 hover:text-sky-300 transition-colors"
                    >
                      <Mail size={11} />
                      {lead.email}
                    </a>
                  )}
                </div>
              )}

              <p className="text-xs text-white/45 mt-2.5 leading-relaxed">
                Everything below is about <em>this</em> business. Read it top to bottom before you call — it goes
                problem → what to sell → what it costs.
              </p>
            </div>

            {/* Everything that can be opened or handed over, in one row, so
                nothing has to be found mid-call. The mockup exists as both a
                link and a PDF because the link needs signal and a password
                and the PDF needs neither — the PDF is simply the newest
                version in the list that came in as a file. */}
            <div className="flex flex-wrap gap-2 mb-3">
              {lead.originalWebsite && (
                  <a
                    href={lead.originalWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-400/10 px-3.5 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-400/20 transition-colors"
                  >
                    <Compass size={13} /> Open their current site
                  </a>
                )}
                {/* Two links, two buttons, and they are not interchangeable.
                    The preview deploys behind a Vercel password, so sending
                    it hands the client a password wall — it is here to
                    navigate to quickly and for nothing else. The folder is
                    the deliverable: the brochure and the video, and the only
                    thing an email carries.

                    Both are always drawn, greyed when there is nothing behind
                    them. A button that vanishes teaches nobody it exists;
                    a greyed one with the reason on it says what to go and
                    add. */}
                <MockupLinkButton
                  href={lead.mockupUrl}
                  icon={<Eye size={13} />}
                  label="Open the preview build"
                  note="ours only"
                  missing="Add the preview link in Mockups to enable this"
                  tone="preview"
                />
                <MockupLinkButton
                  href={lead.mockupFolderUrl}
                  icon={<FolderOpen size={13} />}
                  label="Open the client folder"
                  note="brochure + video"
                  missing="Add the folder link in Mockups to enable this"
                  tone="folder"
                />
                {latestMockupPdf && (
                  <a
                    href={latestMockupPdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-400/10 px-3.5 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-400/20 transition-colors"
                  >
                    <FileText size={13} /> Mockup PDF
                  </a>
                )}
                {lead.invoicePdfUrl && (
                  <a
                    href={lead.invoicePdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/20 transition-colors"
                  >
                    <FileText size={13} /> Invoice PDF
                  </a>
                )}
            </div>

            {/* The mockup deploys password-protected so their competitors
                can't stumble across an unannounced redesign. That password is
                useless if it isn't next to the link. */}
            {lead.vercelDeployPassword && lead.mockupUrl && (
              <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-white/40">Mockup password:</span>
                <code className="rounded-md bg-white/[0.06] border border-white/10 px-2 py-1 font-mono text-white/80">
                  {lead.vercelDeployPassword}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(lead.vercelDeployPassword!)}
                  className="text-sky-300 hover:text-sky-200 transition-colors"
                >
                  Copy
                </button>
              </div>
            )}

            {lead.currentSiteAssessment && (
              <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/40 mb-1.5 font-semibold">
                  <Compass size={12} /> What their site does today
                </p>
                <p className="text-sm text-white/70 leading-relaxed break-words">{lead.currentSiteAssessment}</p>
              </div>
            )}

            {lead.salesNote && (
              <div className="mb-5 rounded-xl border border-sky-400/25 bg-sky-400/[0.08] p-4">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-sky-300 mb-1.5 font-semibold">
                  <StickyNote size={12} /> Read this first — note for you
                </p>
                <p className="text-sm text-sky-50/90 leading-relaxed whitespace-pre-wrap break-words">{lead.salesNote}</p>
              </div>
            )}

            {anything && (
              <div
                id="call-script"
                className="mb-6 scroll-mt-20 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] overflow-hidden"
              >
                <div className="flex items-start justify-between gap-3 p-4">
                  <button onClick={() => setShowScript((v) => !v)} className="min-w-0 text-left">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-100">
                      <Phone size={14} /> Your call script
                    </span>
                    <span className="block text-xs text-emerald-200/60 mt-0.5">
                      The whole call, written out in order. Green is what you say — grey is for you, never read it
                      out.
                    </span>
                  </button>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <button
                      onClick={() => setShowScript((v) => !v)}
                      className="text-xs font-semibold text-emerald-300 whitespace-nowrap"
                    >
                      {showScript ? 'Hide' : 'Open'}
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(callScriptToText(callScript, lead.company));
                        setScriptCopied(true);
                        setTimeout(() => setScriptCopied(false), 2000);
                      }}
                      className="text-[11px] text-emerald-200/60 hover:text-emerald-200 whitespace-nowrap transition-colors"
                    >
                      {scriptCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                {showScript && (
                  <div className="px-4 pb-4 space-y-3">
                    {callScript.map((block, i) => (
                      <div
                        key={i}
                        className={`rounded-lg px-3.5 py-3 border-l-2 ${
                          block.kind === 'spoken'
                            ? 'border-emerald-400/60 bg-white/[0.04]'
                            : 'border-white/20 bg-white/[0.02]'
                        }`}
                      >
                        <p
                          className={`text-[10px] uppercase tracking-wide font-semibold mb-1.5 ${
                            block.kind === 'spoken' ? 'text-emerald-300/80' : 'text-white/35'
                          }`}
                        >
                          {block.heading}
                          {block.kind === 'guidance' && ' — for you, don\u2019t read out'}
                        </p>
                        {block.lines.map((line, j) => (
                          <p
                            key={j}
                            className={`text-xs leading-relaxed break-words ${
                              block.kind === 'spoken' ? 'text-white/85 italic' : 'text-white/50'
                            } ${j > 0 ? 'mt-1.5' : ''}`}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {anything && (
              <div
                id="objections"
                className="mb-6 scroll-mt-20 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden"
              >
                <button
                  onClick={() => setShowObjections((v) => !v)}
                  className="w-full flex items-start justify-between gap-3 p-4 text-left"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-white/85">
                      <AlertTriangle size={14} /> When they try to end the call
                    </span>
                    <span className="block text-xs text-white/40 mt-0.5">
                      The {OBJECTIONS.length} things people say to get off the phone, what each one really means,
                      and what to say back.
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-sky-300">
                    {showObjections ? 'Hide' : 'Open'}
                  </span>
                </button>
                {showObjections && (
                  <div className="px-4 pb-4 space-y-3">
                    {OBJECTIONS.map((o) => (
                      <div key={o.slug} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3.5 min-w-0">
                        <p className="text-sm font-bold text-white/85 break-words">{o.trigger}</p>
                        <p className="text-xs text-white/45 leading-relaxed mt-1.5 break-words">
                          <span className="text-amber-300/90 font-semibold">What it usually means: </span>
                          {o.meaning}
                        </p>
                        <div className="mt-2.5 rounded-lg border-l-2 border-emerald-400/50 bg-white/[0.03] px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-emerald-300/80 font-semibold mb-1">
                            Say this
                          </p>
                          <p className="text-xs text-white/80 italic leading-relaxed break-words">"{o.response}"</p>
                        </div>
                        <p className="text-xs text-white/45 leading-relaxed mt-2 break-words">
                          <span className="text-sky-300/80 font-semibold">Then: </span>
                          {o.thenWhat}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!anything ? (
              <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-200 mb-1">
                  <AlertTriangle size={14} /> Nothing to brief you on yet
                </p>
                <p className="text-xs text-amber-100/70 leading-relaxed">
                  Nobody has recorded what's wrong with this business, so there's nothing to recommend or price.
                  Hit <strong>Edit</strong> on the card below, tick everything you can see wrong under "What's
                  wrong with their current setup?", and save — this brief writes itself from those boxes.
                </p>
              </div>
            ) : (
              <>
                {/* ---- Step 1: their problems ---- */}
                <Step
                  n={1}
                  title="What's wrong with their business right now"
                  hint="Their problems, in plain English. Open the call with these — not with what we sell."
                  foldedSteps={foldedSteps}
                  setFoldedSteps={setFoldedSteps}
                />
                {stepOpen(1) && (
                <div className="space-y-2.5 mb-6">
                  {writtenPains.map((item, i) => {
                    // Their bespoke wording stays the headline and the body;
                    // the matched brief only adds the two things the CSV
                    // can't give — the money angle and a line to say.
                    const matched = classifyWrittenPoint(item.point, item.explanation);
                    const brief = matched ? PAIN_POINT_BRIEFS[matched] : null;
                    return (
                      <div key={`w${i}`} className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3.5 min-w-0">
                        <p className="text-sm font-bold text-red-200 break-words">{item.point}</p>
                        {item.explanation && (
                          <p className="text-xs text-white/60 leading-relaxed mt-1.5 break-words">
                            {item.explanation}
                          </p>
                        )}
                        {brief && (
                          <p className="text-xs text-white/50 leading-relaxed mt-2 break-words">
                            <span className="text-amber-300/90 font-semibold">Why they should care: </span>
                            {brief.costsThem}
                          </p>
                        )}
                        <div className="mt-2.5 rounded-lg border-l-2 border-emerald-400/50 bg-white/[0.03] px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-emerald-300/80 font-semibold mb-1">
                            Say something like this
                          </p>
                          <p className="text-xs text-white/80 italic leading-relaxed break-words">
                            "{painPointPitch(item, lead.company)}"
                          </p>
                        </div>
                        <SectionNote pointKey={item.point} {...sectionNoteShared} />
                      </div>
                    );
                  })}

                  {checklistPains.length > 0 && writtenPains.length > 0 && (
                    <button
                      onClick={() => setShowChecklistPains((v) => !v)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left text-xs font-semibold text-white/55 hover:bg-white/[0.06] transition-colors"
                    >
                      {showChecklistPains ? 'Hide' : 'Show'} {checklistPains.length} more from the checklist — each with a
                      line you can say out loud
                    </button>
                  )}

                  {checklistPains.length > 0 && (writtenPains.length === 0 || showChecklistPains) && (
                    <>
                      {checklistPains.map((key) => {
                        const brief = PAIN_POINT_BRIEFS[key];
                        if (!brief) return null;
                        const fromNotes = inferred.includes(key);
                        return (
                          <div key={key} className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <p className="text-sm font-bold text-red-200">{PAIN_POINTS[key]}</p>
                              {fromNotes && (
                                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/50">
                                  spotted in the notes — double-check
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-white/60 leading-relaxed mb-2 break-words">{brief.problem}</p>
                            <p className="text-xs text-white/50 leading-relaxed mb-2.5 break-words">
                              <span className="text-amber-300/90 font-semibold">Why they should care: </span>
                              {brief.costsThem}
                            </p>
                            <div className="rounded-lg border-l-2 border-emerald-400/50 bg-white/[0.03] px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-emerald-300/80 font-semibold mb-1">
                                Say something like this
                              </p>
                              <p className="text-xs text-white/80 italic leading-relaxed break-words">
                                "{brief.sayThis}"
                              </p>
                            </div>
                            <SectionNote pointKey={PAIN_POINTS[key]} {...sectionNoteShared} />
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
                )}

                {/* ---- Step 2: the core sell ---- */}
                <div className="flex justify-end -mb-1">
                  <button
                    onClick={() => {
                      const next = !allCollapsed;
                      setAllCollapsed(next);
                      setCollapsedItems(
                        next ? new Set([...pricedNeeds, ...pricedUpsell].map((i) => i.point)) : new Set()
                      );
                    }}
                    className="text-[11px] font-semibold text-white/40 hover:text-white/70 transition-colors"
                  >
                    {allCollapsed ? 'Show all the detail' : 'Collapse to just names and prices'}
                  </button>
                </div>

                <Step
                  n={2}
                  title="What they definitely need"
                  hint="This is the actual deal. Without these the problems above aren't fixed — don't discount it away."
                  foldedSteps={foldedSteps}
                  setFoldedSteps={setFoldedSteps}
                />
                {stepOpen(2) && (
                <div className="space-y-2.5 mb-3">
                  {useWrittenNeeds ? (
                    pricedNeeds.map((item, i) => (
                      <PricedCard
                        key={i}
                        i={item}
                        tone="green"
                        company={lead.company}
                        collapsedItems={collapsedItems}
                        setCollapsedItems={setCollapsedItems}
                        sectionNote={sectionNoteShared}
                      />
                    ))
                  ) : (
                    <>
                      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] p-3.5 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="min-w-0">
                            <span className="inline-block rounded bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200 mb-1.5">
                              The main build
                            </span>
                            <p className="text-sm font-bold text-emerald-100 break-words">{base.label}</p>
                          </div>
                          <p className="text-sm font-bold text-emerald-300 whitespace-nowrap">
                            {formatCents(base.price)}
                          </p>
                        </div>
                        <p className="text-xs text-white/60 leading-relaxed mb-1.5 break-words">{base.description}</p>
                        <p className="text-xs text-emerald-200/70 leading-relaxed break-words">
                          <span className="font-semibold">Why this one: </span>
                          {recs.baseReason}
                        </p>
                      </div>
                      {recs.needs.map((item) => (
                        <PricedCard
                          key={item.key}
                          i={asPricedItem(item, 'essential')}
                          tone="green"
                          company={lead.company}
                          collapsedItems={collapsedItems}
                          setCollapsedItems={setCollapsedItems}
                          sectionNote={sectionNoteShared}
                        />
                      ))}
                    </>
                  )}
                </div>
                )}

                {/* ---- Step 3: upsells ---- */}
                {(useWrittenUpsell || recs.upsell.length > 0) && (
                  <>
                    <Step
                      n={3}
                      title="Extras you can add on"
                      hint="Only raise these once they've agreed to the main build. Too early and the price just looks scary."
                      foldedSteps={foldedSteps}
                      setFoldedSteps={setFoldedSteps}
                    />
                    {stepOpen(3) && (
                    <div className="space-y-2.5 mb-3">
                      {useWrittenUpsell
                        ? pricedUpsell.map((item, i) => (
                            <PricedCard
                              key={i}
                              i={item}
                              tone="amber"
                              company={lead.company}
                              collapsedItems={collapsedItems}
                              setCollapsedItems={setCollapsedItems}
                              sectionNote={sectionNoteShared}
                            />
                          ))
                        : recs.upsell.map((item) => (
                            <PricedCard
                              key={item.key}
                              i={asPricedItem(item, 'upsell')}
                              tone="amber"
                              company={lead.company}
                              collapsedItems={collapsedItems}
                              setCollapsedItems={setCollapsedItems}
                              sectionNote={sectionNoteShared}
                            />
                          ))}
                    </div>
                    )}
                  </>
                )}

                {/* ---- Step 4: the money ---- */}
                <Step
                  n={4}
                  title="What to quote"
                  hint="Say the lower number first. The higher one is only if they take every extra."
                  foldedSteps={foldedSteps}
                  setFoldedSteps={setFoldedSteps}
                />
                {stepOpen(4) && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3.5 min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-300/80 font-semibold mb-1">
                      Just what they need
                    </p>
                    <p className="text-lg font-bold text-emerald-300 break-words">{formatCents(low)}</p>
                    <p className="text-[11px] text-emerald-200/60 mt-1 leading-snug">
                      {formatCents(depositAmount(low))} up front ({firstInstalmentPercent(low)}%), rest over the remaining two payments
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-4 py-3.5 min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-amber-300/80 font-semibold mb-1">
                      If they take everything
                    </p>
                    <p className="text-lg font-bold text-amber-300 break-words">{formatCents(high)}</p>
                    <p className="text-[11px] text-amber-200/60 mt-1 leading-snug">Core plus every extra above</p>
                  </div>
                </div>
                )}
                {glossary.length > 0 && (
                  <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <button
                      onClick={() => setShowGlossary((v) => !v)}
                      className="w-full flex items-center justify-between gap-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-white/85">
                          Words in this brief, explained
                        </span>
                        <span className="block text-xs text-white/40 mt-0.5">
                          {glossary.length} term{glossary.length === 1 ? '' : 's'} used above — tap if you're not
                          100% sure what one means
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-sky-300">
                        {showGlossary ? 'Hide' : 'Show'}
                      </span>
                    </button>
                    {showGlossary && (
                      <div className="mt-3 space-y-3">
                        {glossary.map((g) => (
                          <div key={g.term} className="border-t border-white/[0.06] pt-3">
                            <p className="text-sm font-bold text-sky-200">{g.term}</p>
                            <p className="text-xs text-white/60 leading-relaxed mt-1 break-words">{g.plain}</p>
                            {g.sayIt && (
                              <p className="text-xs text-white/45 leading-relaxed mt-1.5 break-words">
                                <span className="text-emerald-300/80 font-semibold">If they ask: </span>"{g.sayIt}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!hasRange && (
                  <p className="text-[11px] text-white/30 leading-relaxed mt-3">
                    These are our standard list prices, added up from the items above. To build a real quote with
                    discounts, timelines or a payment link, open the Proposal tab.
                  </p>
                )}
              </>
            )}
          </div>
        );
      })()}

      {tab === 'call' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        {/* LEFT: Lead info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
            <div className="flex items-start gap-3.5 mb-5">
              <span className="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400/25 to-purple-500/25 border border-white/10 text-lg font-bold text-white/90">
                {lead.company.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2 min-w-0">
                  {/* break-words, not truncate — a long company name must wrap
                      rather than force the row wider than the phone screen. */}
                  <h1 className="text-xl font-bold min-w-0 break-words">{lead.company}</h1>
                  <button
                    onClick={handleToggleHot}
                    title={lead.hotLead ? 'Unmark as hot' : 'Mark as hot lead'}
                    className={`shrink-0 text-base leading-none transition-colors ${lead.hotLead ? 'text-amber-400' : 'text-white/20 hover:text-white/50'}`}
                  >
                    ★
                  </button>
                </div>
                {lead.contactName && <p className="text-sm text-white/40 break-words mt-0.5">{lead.contactName}</p>}
              </div>
              <button
                onClick={() => setEditing(!editing)}
                className="shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full border border-white/15 hover:bg-white/5 transition-colors"
              >
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="min-w-0">
                <label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-purple-300/70 mb-1.5">
                  <Tag size={11} /> Status
                </label>
                <select
                  value={lead.status}
                  onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                  aria-label="Lead status"
                  className={`${inputClass} w-full min-w-0 border-purple-400/20 focus:ring-purple-400/50`}
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-[#05030a]">
                      {LEAD_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                {/* A stage change that didn't save used to fail silently here
                    — the select simply snapped back on the next reload. */}
                {statusError && (
                  <p role="alert" className="text-xs text-red-300 mt-1.5">
                    {statusError}
                  </p>
                )}
              </div>
              <div className="min-w-0 relative">
                <label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-sky-300/70 mb-1.5">
                  <CalendarClock size={11} /> Follow-up
                </label>
                <button
                  type="button"
                  onClick={openFollowUpPicker}
                  className={`${inputClass} w-full min-w-0 flex items-center justify-between gap-1 border-sky-400/20 hover:border-sky-400/40 text-left`}
                >
                  <span className={`truncate ${lead.nextFollowUpAt ? '' : 'text-white/30'}`}>
                    {lead.nextFollowUpAt
                      ? new Date(`${lead.nextFollowUpAt.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Set a date'}
                  </span>
                  <CalendarClock size={13} className="shrink-0 text-sky-300/60" />
                </button>
                <input
                  ref={followUpInputRef}
                  type="date"
                  defaultValue={lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0, 10) : ''}
                  onChange={(e) => handleSetFollowUp(e.target.value)}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setTab('proposal')
              }
              className="w-full mb-4 flex items-center justify-center gap-2 text-sm font-bold px-3.5 py-2.5 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black hover:opacity-90 transition-opacity"
            >
              <FileSignature size={15} /> Jump to proposal
            </button>

            {lead.emailDeliveryFailedAt && (
              <div className="mb-4 rounded-lg bg-red-400/10 border border-red-400/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-red-300 mb-0.5">
                      <MailX size={12} /> Email didn't send — call instead
                    </p>
                    <p className="text-sm text-red-200/80">
                      {lead.emailDeliveryFailedReason || "The address may be invalid or no longer active."}
                    </p>
                  </div>
                  <button
                    onClick={handleClearEmailFailure}
                    className="shrink-0 text-xs text-red-300/60 hover:text-red-200 transition-colors whitespace-nowrap"
                  >
                    Mark resolved
                  </button>
                </div>
              </div>
            )}

            {lead.lostReason && (
              <div className="mb-4 rounded-lg bg-red-400/10 border border-red-400/20 p-3">
                <p className="text-xs text-red-300/70 mb-0.5">Lost reason</p>
                <p className="text-sm text-red-200">{lead.lostReason}</p>
              </div>
            )}

            {editing ? (
              <div className="space-y-3">
                <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className={inputClass} />
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" className={inputClass} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputClass} />
                <PhoneField value={phone} onChange={setPhone} className={inputClass} />
                <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source" className={inputClass} />
                <input
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(e.target.value)}
                  placeholder="Estimated value (USD)"
                  type="number"
                  className={inputClass}
                />
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Quick notes..."
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
                <input
                  value={originalWebsite}
                  onChange={(e) => setOriginalWebsite(e.target.value)}
                  placeholder="Their existing website (https://...)"
                  className={inputClass}
                />
                <textarea
                  value={salesNote}
                  onChange={(e) => setSalesNote(e.target.value)}
                  placeholder="Note for Evan — strategy, what to lead with, etc."
                  rows={2}
                  className={`${inputClass} resize-none`}
                />

                <div>
                  <p className="text-xs text-white/40 mb-2">What's wrong with their current setup?</p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {(Object.entries(PAIN_POINTS) as [PainPointKey, string][]).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={painPoints.includes(key)}
                          onChange={() => togglePainPoint(key)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            ) : (
              <div className="text-sm">
                <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky-400/10 text-sky-300 shrink-0">
                      <User size={14} />
                    </span>
                    <span className={lead.contactName ? '' : 'text-white/30 italic'}>
                      {lead.contactName || 'No contact name'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky-400/10 text-sky-300 shrink-0">
                      <Mail size={14} />
                    </span>
                    {lead.email ? (
                      <a href={`mailto:${lead.email}`} className="hover:text-sky-300 transition-colors min-w-0 break-all">
                        {lead.email}
                      </a>
                    ) : (
                      <span className="text-amber-300/80 italic">No email — call instead</span>
                    )}
                  </div>
                  <div className="flex items-start gap-3 px-3 py-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-400/10 text-amber-300 shrink-0">
                      <Phone size={14} />
                    </span>
                    <div className="min-w-0">
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} className="hover:text-amber-300 transition-colors break-all">
                          {lead.phone}
                        </a>
                      ) : (
                        <span className="text-white/30 italic">No phone on file</span>
                      )}
                      {(() => {
                        const lt = leadLocalTime(lead.phone, new Date(nowTick));
                        if (!lt) return null;
                        const c =
                          lt.callability === 'good'
                            ? 'text-emerald-300'
                            : lt.callability === 'okay'
                              ? 'text-amber-300'
                              : 'text-red-300';
                        return (
                          <p className="text-xs mt-1 leading-relaxed">
                            {lt.time && <span className={`font-semibold ${c}`}>{lt.time} their time — </span>}
                            <span className="text-white/40">{lt.advice}</span>
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-400/10 text-purple-300 shrink-0">
                      <Compass size={14} />
                    </span>
                    <span className={lead.source ? '' : 'text-white/30 italic'}>{lead.source || 'Unknown source'}</span>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-400/10 text-emerald-300 shrink-0">
                      <DollarSign size={14} />
                    </span>
                    <span className={lead.estimatedValue ? 'font-semibold text-emerald-300' : 'text-white/30 italic'}>
                      {lead.estimatedValue ? formatCents(lead.estimatedValue) : 'No estimate set'}
                    </span>
                  </div>
                </div>

                {lead.notes && (
                  <div className="mt-4">
                    <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-white/35 mb-1.5">
                      <StickyNote size={11} /> Notes
                    </p>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.06]">
                      {lead.notes.split(/\n{2,}|\s+\|\s+/).map((block, i) => {
                        const match = block.match(/^([A-Za-z][A-Za-z \/()\-]{1,34}):\s*([\s\S]*)$/);
                        return (
                          <div key={i} className="px-3.5 py-3">
                            {match ? (
                              <>
                                <p className="text-[11px] uppercase tracking-wide text-sky-300/70 mb-1">{match[1]}</p>
                                <p className="text-white/70 leading-relaxed whitespace-pre-line break-words">{match[2]}</p>
                              </>
                            ) : (
                              <p className="text-white/70 leading-relaxed whitespace-pre-line">{block}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {painPoints.length > 0 && (
                  <div className="mt-4">
                    <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-white/35 mb-1.5">
                      <AlertTriangle size={11} /> Identified issues
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {painPoints.map((p) => (
                        <span key={p} className="text-xs px-2 py-1 rounded-full bg-red-400/10 text-red-300 border border-red-400/10">
                          {PAIN_POINTS[p]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Activity timeline + logger */}
        <div className="lg:col-span-2 space-y-6">
          <Section
            id="lead-log-activity"
            title="Log something by hand"
            hint="A note, an objection, a call you made elsewhere — anything the buttons above don't cover."
            summary="Nothing here needs your attention. Open it to add a note."
          >

            <div className="flex flex-wrap gap-2 mb-3">
              {LEAD_ACTIVITY_MANUAL_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setActivityType(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    activityType === t
                      ? 'bg-gradient-to-r from-sky-400 to-purple-500 text-black font-semibold'
                      : 'border border-white/15 text-white/60 hover:bg-white/5'
                  }`}
                >
                  {LEAD_ACTIVITY_LABELS[t]}
                </button>
              ))}
            </div>

            {(activityType === 'email' || activityType === 'note' || activityType === 'call') && (
              <select
                value=""
                onChange={(e) => {
                  const tmpl = SALES_TEMPLATES.find((t) => t.label === e.target.value);
                  if (tmpl) {
                    setActivityContent(tmpl.body);
                    if (activityType === 'email' && tmpl.subject) setEmailSubject(tmpl.subject);
                  }
                }}
                className={`${inputClass} mb-3 text-sm`}
              >
                <option value="" className="bg-[#05030a]">Insert a template...</option>
                <optgroup label="Follow-up" className="bg-[#05030a]">
                  {SALES_TEMPLATES.filter((t) => t.category === 'follow-up').map((t) => (
                    <option key={t.label} value={t.label} className="bg-[#05030a]">{t.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Objection handling" className="bg-[#05030a]">
                  {SALES_TEMPLATES.filter((t) => t.category === 'objection').map((t) => (
                    <option key={t.label} value={t.label} className="bg-[#05030a]">{t.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Closing" className="bg-[#05030a]">
                  {SALES_TEMPLATES.filter((t) => t.category === 'closing').map((t) => (
                    <option key={t.label} value={t.label} className="bg-[#05030a]">{t.label}</option>
                  ))}
                </optgroup>
              </select>
            )}

            {activityType === 'email' && (
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject"
                className={`${inputClass} mb-3`}
              />
            )}

            <textarea
              value={activityContent}
              onChange={(e) => setActivityContent(e.target.value)}
              placeholder={
                activityType === 'email'
                  ? 'Email body...'
                  : activityType === 'loom'
                  ? 'What does this Loom cover?'
                  : activityType === 'call'
                  ? 'What was discussed on the call?'
                  : 'Note...'
              }
              rows={4}
              className={`${inputClass} resize-none mb-3`}
            />

            {(activityType === 'loom' || activityType === 'call') && (
              <input
                value={activityUrl}
                onChange={(e) => setActivityUrl(e.target.value)}
                placeholder={activityType === 'loom' ? 'Loom video URL' : 'Recording URL (optional)'}
                className={`${inputClass} mb-3`}
              />
            )}

            {activityType === 'email' && (
              <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
                <input type="checkbox" checked={sendEmailNow} onChange={(e) => setSendEmailNow(e.target.checked)} />
                Actually send this email to {lead.email || 'the lead'} now
              </label>
            )}

            {activityMessage && <p className="text-sm text-emerald-300 mb-3">{activityMessage}</p>}

            <button
              onClick={handleLogActivity}
              disabled={loggingActivity || !activityContent.trim()}
              className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {loggingActivity ? 'Saving...' : 'Log Activity'}
            </button>
          </Section>

          <Section
            id="lead-mockups"
            title="Mockups"
            hint="What we built for them, and whether they have looked at it."
            defaultOpen={mockupSummary.open}
            attention={mockupSummary.attention}
            summary={mockupSummary.line}
          >
            {lead.mockupFolderUrl ? (
              <p className="text-xs text-emerald-300 mb-3">
                Latest delivered {lead.mockupDeliveredAt ? new Date(lead.mockupDeliveredAt).toLocaleDateString() : ''} — every
                version below, with whatever you noted against it.
              </p>
            ) : lead.mockupRequested ? (
              <p className="text-xs text-amber-300 mb-3">
                Requested {lead.mockupRequestedAt ? new Date(lead.mockupRequestedAt).toLocaleDateString() : ''} — waiting on the
                team. Attach it here yourself if it reaches you first.
              </p>
            ) : (
              <div className="mb-3">
                <p className="text-xs text-white/40 mb-3">
                  Need a visual to show this lead? Request one and it'll flag the team until it's ready — or attach one you
                  already have.
                </p>
                <button
                  onClick={handleRequestMockup}
                  disabled={requestingMockup}
                  className="px-4 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/5 disabled:opacity-50 transition-colors"
                >
                  {requestingMockup ? 'Requesting...' : '🎨 Request Mockup'}
                </button>
              </div>
            )}

            {/* Two slots, said out loud, because one field holding both is
                what put a password-protected preview behind a button reading
                "open the mockup we sent". */}
            <div className="mb-4 space-y-3">
              <MockupLinkSlot
                leadId={leadId}
                field="mockupFolderUrl"
                value={lead.mockupFolderUrl}
                label="Mockup folder"
                tone="send"
                hint="The Drive folder the client gets — screenshots, the brochure, the walkthrough video. This is the only link that goes in an email."
                placeholder="drive.google.com/drive/folders/..."
                onSaved={load}
              />
              <MockupLinkSlot
                leadId={leadId}
                field="mockupUrl"
                value={lead.mockupUrl}
                label="Preview build"
                tone="internal"
                hint="The Vercel subdomain, for pulling up quickly on a call. Password-protected, so it is never sent to anybody."
                placeholder="company.bothmade.studio"
                onSaved={load}
              />
            </div>

            {lead.mockupFolderUrl && (
              <SendMockupPanel
                recipientName={lead.contactName}
                company={lead.company}
                emailOnFile={lead.email}
                sending={sendingMockup}
                notice={mockupSendNotice}
                onSend={handleSendMockup}
                written={Boolean(lead.mockupEmailDraft)}
              />
            )}

            <LeadMockupsPanel leadId={leadId} onChanged={load} />

            {lead.mockupFolderUrl && (
              <p className="text-xs text-white/30 mt-3">Now's the time to call, email, or follow up with this in hand.</p>
            )}
          </Section>

          {/* Files and access. The mockup link is upstairs because it's what
              gets sent; this is everything that gets kept — the PDF copies,
              and the password without which the link is a dead end. */}
          {(() => {
            // Line items the import couldn't price from the catalogue. They
            // belong here, next to the PDF fields, because this is the moment
            // somebody is about to put a number on paper — and these are the
            // numbers that are still ours to decide.
            const customLineItems = [
              ...parseSalesPoints(lead.essentialPoints).map((p) => ({ ...p, kind: 'Must-have' })),
              ...parseSalesPoints(lead.upsellPoints).map((p) => ({ ...p, kind: 'Extra' })),
            ].filter((p) => p.isCustom);

            return (
              <Section
                id="lead-files"
                title="Files &amp; access"
                hint="The copies that outlive the deployment — downloadable any time, with or without signal."
                summary={
                  [
                    lead.invoicePdfUrl && 'signed invoice',
                    lead.vercelDeployPassword && 'preview password',
                    customLineItems.length > 0 && `${customLineItems.length} custom line items`,
                  ].filter(Boolean).join(' · ') || 'Nothing filed against this lead yet.'
                }
              >

                <div className="space-y-3">
                  <FileField
                    label="Mockup PDF"
                    hint="An export Evan can download and open on a call. Saving adds it to this lead's mockup versions rather than replacing the last one."
                    value={mockupPdfUrl}
                    onChange={setMockupPdfUrl}
                    saved={latestMockupPdf}
                    inputClass={inputClass}
                    leadId={leadId}
                  />
                  <FileField
                    label="Invoice PDF"
                    hint="Left blank until the client is onboarded — then it's the copy to hand over."
                    value={invoicePdfUrl}
                    onChange={setInvoicePdfUrl}
                    saved={lead.invoicePdfUrl}
                    inputClass={inputClass}
                    leadId={leadId}
                  />
                  <div>
                    <p className="text-xs text-white/50 mb-1 font-medium">Vercel deployment password</p>
                    <p className="text-[11px] text-white/30 mb-1.5">
                      The mockup deploys protected so their competitors can't find it. Keep it here so it's next to
                      the link.
                    </p>
                    <input
                      value={vercelDeployPassword}
                      onChange={(e) => setVercelDeployPassword(e.target.value)}
                      placeholder="e.g. linpotia-2026"
                      className={`${inputClass} text-sm font-mono`}
                    />
                  </div>
                </div>

                <button
                  onClick={handleSaveFiles}
                  disabled={savingFiles}
                  className="mt-4 px-4 py-2 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  {savingFiles ? 'Saving...' : 'Save'}
                </button>

                {customLineItems.length > 0 && (
                  <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
                    <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-amber-300 font-semibold">
                      <AlertTriangle size={12} /> Prices still to agree
                    </p>
                    <p className="text-xs text-amber-100/60 mt-1 leading-relaxed">
                      These aren't in our catalogue, so the figures below are suggestions sized to this business.
                      Decide them before either PDF goes out — whatever you put on paper is what gets quoted.
                    </p>
                    <ul className="mt-3 space-y-2">
                      {customLineItems.map((c, i) => (
                        <li key={i} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-white/85 break-words">
                              <span className="text-[10px] uppercase tracking-wide text-white/35 mr-1.5">
                                {c.kind}
                              </span>
                              {c.point}
                            </p>
                            {c.explanation && (
                              <p className="text-xs text-white/45 leading-relaxed break-words">{c.explanation}</p>
                            )}
                          </div>
                          <span className="shrink-0 text-sm font-bold text-amber-200 whitespace-nowrap">
                            {c.priceCents !== null ? formatCents(c.priceCents) : 'TBD'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-white/30 mt-3">
                      Edit any of these on the line itself — the price is the bit after the <code>|</code>. Drop the
                      word <code>custom</code> once the figure is agreed.
                    </p>
                  </div>
                )}
              </Section>
            );
          })()}

          <Section
            id="lead-qualification"
            title="Qualification"
            hint={'Need, Authority, Budget, Timing, Motivation — fill in all five and this lead auto-advances to "Qualified."'}
            summary={
              <span className={lead.qualifiedAt ? 'text-emerald-300' : undefined}>
                {qualAnswered} of 5 answered{lead.qualifiedAt ? ' — qualified' : ''}
                {qualAnswered === 0 && ' — nothing captured yet'}
              </span>
            }
          >

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-white/40 mb-1">Need — does the current situation create an actual problem?</label>
                <textarea
                  value={qualNeed}
                  onChange={(e) => setQualNeed(e.target.value)}
                  rows={2}
                  placeholder="e.g. Enquiry form is confusing, mobile menu is broken, no clear route to a quote request..."
                  className={`${inputClass} text-sm resize-none`}
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Authority — can this person actually approve the project?</label>
                <textarea
                  value={qualAuthority}
                  onChange={(e) => setQualAuthority(e.target.value)}
                  rows={2}
                  placeholder="e.g. Owner, sole decision-maker. Or: needs sign-off from a business partner."
                  className={`${inputClass} text-sm resize-none`}
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Budget — realistic expectations vs. our $5k–6k range?</label>
                <textarea
                  value={qualBudget}
                  onChange={(e) => setQualBudget(e.target.value)}
                  rows={2}
                  placeholder="e.g. Confirmed comfortable in range. Or: hoping for something closer to $2k."
                  className={`${inputClass} text-sm resize-none`}
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Timing — is there a real driver, or "someday"?</label>
                <textarea
                  value={qualTiming}
                  onChange={(e) => setQualTiming(e.target.value)}
                  rows={2}
                  placeholder="e.g. Wants to launch before a trade show in March. Or: no urgency, just browsing."
                  className={`${inputClass} text-sm resize-none`}
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Motivation — why are they considering this now?</label>
                <textarea
                  value={qualMotivation}
                  onChange={(e) => setQualMotivation(e.target.value)}
                  rows={2}
                  placeholder="e.g. Losing quotes to a competitor with a stronger site."
                  className={`${inputClass} text-sm resize-none`}
                />
              </div>
            </div>

            <button
              onClick={handleSaveQualification}
              disabled={savingQual}
              className="mt-4 px-5 py-2.5 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {savingQual ? 'Saving...' : 'Save Qualification'}
            </button>
          </Section>

          <Section
            id="lead-loop-in"
            title="Loop in the team"
            hint="Ping the team chat about this lead — a question, a heads-up, a second opinion."
            summary="Nobody has been asked about this one."
          >
            <div className="flex gap-2 mb-2">
              <input
                value={loopMessage}
                onChange={(e) => setLoopMessage(e.target.value)}
                placeholder="e.g. Can you double check this pricing before I send it?"
                className={`${inputClass} text-sm`}
              />
              <button
                onClick={handleLoopIn}
                disabled={loopSending || !loopMessage.trim()}
                className="px-4 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/5 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {loopSending ? 'Sending...' : 'Send'}
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-white/40 cursor-pointer">
              <input type="checkbox" checked={loopUrgent} onChange={(e) => setLoopUrgent(e.target.checked)} />
              🚩 Flag as needing a response (shows in their notifications until resolved)
            </label>
            {loopStatus && <p className="text-xs text-emerald-300 mt-2">{loopStatus}</p>}
          </Section>

          <Section
            id="lead-timeline"
            title="Timeline"
            hint="Everything that has ever happened with this business, newest first."
            defaultOpen
            summary={
              lead.activities.length === 0
                ? 'Nothing has happened yet.'
                : `${lead.activities.length} ${lead.activities.length === 1 ? 'entry' : 'entries'}${
                    lead.activities[0]
                      ? ` · last was ${LEAD_ACTIVITY_LABELS[lead.activities[0].type as LeadActivityType] ?? lead.activities[0].type} on ${new Date(lead.activities[0].createdAt).toLocaleDateString()}`
                      : ''
                  }`
            }
          >
            {/* Two kinds of entry sit in this list and they used to look the
                same. An email or a proposal row is a receipt — a record that
                something went out. A note, a call write-up or an objection is
                our reading of this person, in our words, and usually blunter
                than anything we would say to their face.
                A rep skimming this before a call cannot be left to work out
                which is which, and the lock is what says it: it marks the
                rows that exist only in here. */}
            <p className="mb-4 mt-1 flex items-center gap-1.5 text-[11px] text-white/35">
              <Lock size={11} className="text-amber-300/70" />
              marks our own words — those rows are internal, and nothing in them has been said to
              this person
            </p>
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {lead.activities.length === 0 && (
                <p className="text-white/40 text-sm">No activity logged yet.</p>
              )}
              {lead.activities.map((activity) => {
                const internal = leadActivityIsInternal(activity.type);
                const objection = activity.type === 'objection';
                return (
                  <div
                    key={activity.id}
                    className={`rounded-lg border-l-2 p-4 ${
                      objection
                        ? 'border-red-400/50 bg-red-400/[0.06]'
                        : internal
                          ? 'border-amber-400/50 bg-amber-400/[0.05]'
                          : 'border-sky-400/50 bg-white/5'
                    }`}
                  >
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <span
                        className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
                          objection ? 'text-red-300' : internal ? 'text-amber-300' : 'text-sky-300'
                        }`}
                      >
                        {internal && <Lock size={11} />}
                        {LEAD_ACTIVITY_LABELS[activity.type]}
                      </span>
                      <span className="shrink-0 text-xs text-white/30">
                        {new Date(activity.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-white/70 whitespace-pre-wrap">{activity.content}</p>
                    {activity.url && (
                      <a
                        href={activity.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs text-sky-300 hover:underline"
                      >
                        {activity.url}
                      </a>
                    )}
                    <p className="mt-1.5 text-xs text-white/30">
                      by {activity.createdBy?.name || 'Team'}
                      {internal && (
                        <span className="text-amber-300/50">
                          {' '}
                          · only visible here — never quote this back to them
                        </span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      </div>

      )}

      {/* Proposal builder — configure exactly what they want, then send a payment link or a contract */}
      {tab === 'proposal' && (
      <div
        id="proposal-builder"
        className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.03] backdrop-blur-xl p-6 md:p-8 mt-6 shadow-[0_0_60px_-15px_rgba(56,189,248,0.15)]"
      >
        <div className="flex items-center gap-3 mb-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-sky-400 to-purple-500 text-black text-sm font-bold">
            ✦
          </span>
          <h2 className="text-xl font-bold">Onboard This Customer</h2>
        </div>
        <p className="text-sm text-white/40 mb-4 ml-11">
          Configure exactly what they want, then send a payment link or generate a contract — no need to send them back to the pricing page.
        </p>

        {nextStepMessage && (
          <div className="ml-11 mb-4 rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
            {nextStepMessage}
          </div>
        )}

        {restoredDraft && (
          <div className="ml-11 mb-8 flex items-center justify-between gap-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm text-emerald-200">
            <span>↺ Restored your unsaved selections from last time — nothing was lost.</span>
            <button
              onClick={() => setRestoredDraft(false)}
              aria-label="Dismiss"
              className="text-emerald-200/60 hover:text-emerald-100 transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-8 min-w-0">
          {/* Left: configuration steps */}
          <div className="space-y-8">
            <div>
              <StepLabel n={1} label="Base Service" />
              <BaseServicePicker value={proposalService} onChange={setProposalService} columns={3} />
            </div>

            <div>
              <StepLabel n={2} label="Add-Ons" hint={`${proposalAddOns.length} selected`} />
              <div className="max-h-80 overflow-y-auto pr-1">
                <AddOnPicker
                  baseService={proposalService}
                  selected={proposalAddOns}
                  onToggle={toggleProposalAddOn}
                />
              </div>
            </div>

            <CustomLineItems
              customItems={customItems}
              draftCustomLabel={draftCustomLabel}
              setDraftCustomLabel={setDraftCustomLabel}
              draftCustomPrice={draftCustomPrice}
              setDraftCustomPrice={setDraftCustomPrice}
              draftCustomDescription={draftCustomDescription}
              setDraftCustomDescription={setDraftCustomDescription}
              draftCustomScopeShort={draftCustomScopeShort}
              lastRemovedCustomItem={lastRemovedCustomItem}
              addCustomItem={addCustomItem}
              removeCustomItem={removeCustomItem}
              undoRemoveCustomItem={undoRemoveCustomItem}
              setCustomItemDescription={setCustomItemDescription}
              formatCurrencyInputValue={formatCurrencyInputValue}
              inputClass={inputClass}
            />

            <div>
              <StepLabel n={4} label="Client Details" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-2 text-white/50">Client Type</label>
                  <select
                    value={proposalClientType}
                    onChange={(e) => setProposalClientType(e.target.value as ClientType)}
                    className={inputClass}
                  >
                    {(Object.entries(CLIENT_TYPES) as [ClientType, (typeof CLIENT_TYPES)[ClientType]][]).map(
                      ([key, type]) => (
                        <option key={key} value={key} className="bg-[#05030a]">
                          {type.label}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-2 text-white/50">Timeline</label>
                  <select
                    value={proposalTimeline}
                    onChange={(e) => setProposalTimeline(e.target.value as TimelineKey)}
                    className={inputClass}
                  >
                    {(Object.entries(TIMELINES) as [TimelineKey, (typeof TIMELINES)[TimelineKey]][]).map(([key, tl]) => (
                      <option key={key} value={key} className="bg-[#05030a]">
                        {tl.label} ({tl.weeks})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Right: sticky summary + actions */}
          <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs text-white/40 mb-3">Summary</p>
              <div className="space-y-1.5 text-sm mb-4">
                <div className="flex justify-between text-white/60">
                  <span>Base</span>
                  <span>{formatCents(proposalBreakdown.basePrice)}</span>
                </div>
                {proposalBreakdown.addOnsPrice > 0 && (
                  <div className="flex justify-between text-white/60">
                    <span>Add-ons ({proposalAddOns.length})</span>
                    <span>{formatCents(proposalBreakdown.addOnsPrice)}</span>
                  </div>
                )}
                {customItems.map((item, i) => (
                  <div key={i} className="flex justify-between font-medium text-amber-200">
                    <span>{item.label}</span>
                    <span>{formatCents(item.priceCents)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-baseline border-t border-white/10 pt-3">
                <span className="font-semibold text-sm">Total</span>
                <span className="text-2xl font-bold bg-gradient-to-r from-sky-300 to-purple-300 bg-clip-text text-transparent">
                  {formatCents(proposalGrandTotal)}
                </span>
              </div>

              {/* The schedule, spelled out, so the number on the button is
                  never a number Evan has to work out. Two explicit choices
                  rather than one box: "pay in full" is a real thing a client
                  sometimes asks for, but it has to be chosen, not defaulted
                  into by forgetting. */}
              <div className="mt-4 space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">How they pay</p>

                <button
                  type="button"
                  onClick={() => setDepositOnly(true)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    depositOnly ? 'border-sky-400/40 bg-sky-400/[0.07]' : 'border-white/[0.08] hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                        depositOnly ? 'border-sky-400 bg-sky-400' : 'border-white/25'
                      }`}
                    />
                    <span className="text-sm font-semibold text-white">
                      {instalmentSchedule(proposalGrandTotal).map((r) => `${r.percent}%`).join(' / ')} over{' '}
                      {instalmentSchedule(proposalGrandTotal).length} payments
                    </span>
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-sky-300/70">
                      Standard
                    </span>
                  </div>
                  <ul className="space-y-1 pl-5">
                    {instalmentSchedule(proposalGrandTotal).map((row) => (
                      <li key={row.index} className="flex items-baseline gap-2 text-[11px]">
                        <span className={row.index === 1 ? 'text-white/80' : 'text-white/45'}>{row.label}</span>
                        <span className="text-white/25 capitalize">{row.triggerLabel}</span>
                        <span className={`ml-auto tabular-nums ${row.index === 1 ? 'text-sky-300 font-semibold' : 'text-white/50'}`}>
                          {formatCentsExact(row.amountCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 pl-5 text-[11px] text-white/40">
                    Charges {formatCentsExact(instalmentSchedule(proposalGrandTotal)[0].amountCents)} now. The rest is
                    invoiced from the project page when each gate is reached.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDepositOnly(false)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    !depositOnly ? 'border-amber-400/40 bg-amber-400/[0.07]' : 'border-white/[0.08] hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                        !depositOnly ? 'border-amber-400 bg-amber-400' : 'border-white/25'
                      }`}
                    />
                    <span className="text-sm font-semibold text-white">Pay the whole fee up front</span>
                    <span className="ml-auto tabular-nums text-sm text-amber-200">{formatCents(proposalGrandTotal)}</span>
                  </div>
                  <p className="mt-1.5 pl-5 text-[11px] text-white/40">
                    Only when the client has asked for it. Charges the full {formatCents(proposalGrandTotal)} on the
                    first click, and the invoice shows no schedule.
                  </p>
                </button>
              </div>

              <label className="flex items-start gap-2 text-xs text-white/55 mt-2 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={isConsumer} onChange={(e) => setIsConsumer(e.target.checked)} />
                <span>
                  This client is an <span className="text-white/80">individual, not a business</span> — issue the
                  consumer form of the agreement (statutory 14-day cancellation rights). The B2B terms are void
                  against a consumer, so guessing wrong protects nobody.
                </span>
              </label>
            </div>

            {proposalChangedSinceSent && !confirmingSend && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200 space-y-1.5">
                <p>
                  ⚠ You've changed something since this was last sent to {lead.email || 'the client'} — they're still seeing the old version until you send it again.
                </p>
                <button
                  onClick={handleRevertToLastSent}
                  className="font-medium underline underline-offset-2 hover:text-amber-100 transition-colors"
                >
                  ↺ Revert to what was last sent
                </button>
              </div>
            )}

            {customScopeBlocked && (
              <div className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2.5 text-xs text-red-200 space-y-1">
                <p className="font-semibold">
                  Describe the custom work first — {customItemsNeedingScope.map((c) => `"${c.label}"`).join(', ')}
                </p>
                <p className="text-red-200/75">
                  The contract quotes your description word for word. Until it's written, sending or generating one
                  would leave what you're both agreeing to open to interpretation.
                </p>
              </div>
            )}

            {proposalError && <p className="text-red-400 text-sm">{proposalError}</p>}

            {confirmingSend ? (
              <div className="rounded-lg border-2 border-sky-400/40 bg-sky-400/10 p-4 space-y-3">
                <p className="text-sm">
                  Send to <span className="font-semibold">{lead.email || '(no email on file)'}</span> — charges{' '}
                  <span className="font-semibold">
                    {depositOnly
                      ? `${instalmentSchedule(proposalGrandTotal)[0].label}, ${formatCentsExact(
                          instalmentSchedule(proposalGrandTotal)[0].amountCents
                        )}`
                      : `${formatCents(proposalGrandTotal)} in full`}
                  </span>
                  ?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={doEmailPaymentLink}
                    disabled={emailingLink}
                    className="flex-1 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    {emailingLink ? 'Sending...' : 'Yes, send it'}
                  </button>
                  <button
                    onClick={() => setConfirmingSend(false)}
                    disabled={emailingLink}
                    className="rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => setConfirmingSend(true)}
                  disabled={emailingLink || creatingLink || !lead.email || customScopeBlocked}
                  title={
                    !lead.email
                      ? 'Add an email for this lead before sending'
                      : customScopeBlocked
                        ? 'Describe the custom work above before sending — the agreement goes out with this link'
                        : undefined
                  }
                  className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-3 font-semibold text-black disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  {emailingLink
                    ? 'Sending...'
                    : depositOnly
                      ? `Email Sign & Pay — ${instalmentSchedule(proposalGrandTotal)[0].label}`
                      : 'Email Sign & Pay — full amount'}
                </button>
                {!lead.email && (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 space-y-2">
                    <p className="text-xs text-amber-200">
                      No email on file for this lead — add one to send the link.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        placeholder="client@company.com"
                        value={quickEmail}
                        onChange={(e) => setQuickEmail(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveQuickEmail();
                          }
                        }}
                        className={`${inputClass.replace('w-full', '')} flex-1 min-w-0`}
                      />
                      <button
                        onClick={handleSaveQuickEmail}
                        disabled={savingQuickEmail || !quickEmail.trim()}
                        className="shrink-0 rounded-lg border border-white/20 px-4 text-sm font-medium disabled:opacity-40 hover:bg-white/5 transition-colors"
                      >
                        {savingQuickEmail ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <button
                onClick={handleCreatePaymentLink}
                disabled={creatingLink || emailingLink}
                className="w-full rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-white/5 transition-colors"
              >
                {creatingLink ? 'Creating...' : 'Just Generate the Link'}
              </button>
              <button
                onClick={handleCopyProposalText}
                className="w-full rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                {copiedProposalText ? '✓ Copied — paste into a text' : 'Copy as Text (for texting/WhatsApp)'}
              </button>
              <button
                onClick={handleDownloadContract}
                disabled={downloadingContract || customScopeBlocked}
                title={
                  customScopeBlocked
                    ? 'Describe the custom work above before generating the contract'
                    : undefined
                }
                className="w-full rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
              >
                {downloadingContract ? 'Generating...' : 'Download Contract PDF'}
              </button>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => handleSendInvoice('client')}
                  disabled={sendingInvoice !== null}
                  className="flex-1 min-w-0 rounded-lg border border-white/20 px-3 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-white/5 transition-colors"
                >
                  {sendingInvoice === 'client' ? 'Sending...' : 'Email Invoice to Client'}
                </button>
                <button
                  onClick={() => handleSendInvoice('self')}
                  disabled={sendingInvoice !== null}
                  className="flex-1 min-w-0 rounded-lg border border-white/20 px-3 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-white/5 transition-colors"
                >
                  {sendingInvoice === 'self' ? 'Sending...' : 'Email Invoice to Myself'}
                </button>
              </div>
              {invoiceStatus && <p className="text-xs text-emerald-300">{invoiceStatus}</p>}
              <button
                onClick={handleConvertToProject}
                disabled={convertingToProject}
                className="w-full rounded-lg border border-emerald-400/30 px-5 py-2.5 text-sm font-medium text-emerald-300 disabled:opacity-50 hover:bg-emerald-400/10 transition-colors"
              >
                Convert to Project (skip payment)
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
              <span className="text-xs text-white/50">Contract status</span>
              <select
                value={lead.contractStatus}
                onChange={(e) => handleSetContractStatus(e.target.value as LeadDetail['contractStatus'])}
                className="text-xs bg-transparent border-none focus:outline-none text-right font-medium cursor-pointer"
              >
                <option value="not_sent" className="bg-[#05030a]">Not sent</option>
                <option value="sent" className="bg-[#05030a]">Sent — awaiting signature</option>
                <option value="signed" className="bg-[#05030a]">Signed</option>
              </select>
            </div>

            {lead.agreementSignedAt && (
              <div className="text-xs">
                <p className="text-emerald-300">
                  ✓ Signed{lead.agreementSignerName ? ` by ${lead.agreementSignerName}` : ' online'}{' '}
                  {new Date(lead.agreementSignedAt).toLocaleString()}
                  {lead.agreementIp ? ` from ${lead.agreementIp}` : ''}
                </p>
                {/* The browser string is the least readable part of the
                    evidence and the least often needed — kept on the page,
                    but out of the way until somebody hovers for it. */}
                {lead.agreementUserAgent && (
                  <p className="mt-0.5 truncate text-white/30" title={lead.agreementUserAgent}>
                    {lead.agreementUserAgent}
                  </p>
                )}
              </div>
            )}
            {lead.signedContractUrl && (
              <a
                href={lead.signedContractUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-sky-300 hover:underline"
              >
                View signed copy
              </a>
            )}

            {linkEmailStatus && <p className="text-xs text-white/50">{linkEmailStatus}</p>}

            {paymentLinkUrl && (
              <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                <p className="text-xs text-white/50 mb-2">Sign &amp; pay link — one page: review, agree, pay:</p>
                <div className="flex gap-2">
                  <input readOnly value={paymentLinkUrl} className="w-full px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-white/70" />
                  <button
                    onClick={() => navigator.clipboard.writeText(paymentLinkUrl)}
                    className="px-3 py-1.5 rounded-md border border-white/20 text-xs hover:bg-white/5 transition-colors whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 mt-2.5 pt-2.5 border-t border-white/10">
                  <p className="text-[11px] text-white/35">
                    Sent it to the wrong person? Revoking stops every link already out there.
                  </p>
                  <button
                    onClick={handleRevokeLink}
                    disabled={revokingLink}
                    className="px-2.5 py-1 rounded-md border border-amber-400/30 text-[11px] text-amber-200 hover:bg-amber-400/10 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {revokingLink ? 'Revoking…' : 'Revoke & regenerate'}
                  </button>
                </div>
                {revokeNote && <p className="text-[11px] text-white/50 mt-2">{revokeNote}</p>}
              </div>
            )}

            <p className="text-xs text-white/30">
              The link above handles agreement + payment in one step. Need a more formal signature
              for a specific deal instead? Download the contract PDF and use your Google Workspace
              "Request eSignature" on it manually.
            </p>
          </div>
        </div>
      </div>

      )}

      {pendingLostStatus && (
        <LostReasonModal
          companyName={pendingLostStatus.company}
          onCancel={cancelLost}
          onConfirm={handleConfirmLost}
        />
      )}
    </div>
  );
}

