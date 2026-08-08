'use client';

import type { Dispatch, SetStateAction } from 'react';
import { ChevronRight, FileText, StickyNote } from 'lucide-react';
import { PdfOrLinkField } from '@/components/admin/PdfOrLinkField';
import { personalise, type PricedItem } from '@/lib/playbook-seed';
import { formatCents } from '@/lib/pricing';
import type { LeadActivityType } from '@/lib/leads';

/** One entry on a lead's timeline. Shared with the page that renders them. */
export interface Activity {
  id: string;
  type: LeadActivityType;
  content: string;
  url: string | null;
  createdAt: string;
  createdBy: { name: string | null } | null;
}

/**
 * The presentational pieces of the lead page.
 *
 * They live here rather than inside the page for two reasons. The obvious
 * one is that the page was four thousand lines and these are the parts of it
 * that have nothing to do with a lead. The load-bearing one is remounting: a
 * component defined inside a render is a new component type on every render,
 * so React tears down and rebuilds its subtree on every keystroke — which is
 * exactly how a textarea loses focus mid-sentence.
 */

/**
 * A URL to a stored file, with the one-click Open button that's the entire
 * point of storing it — a field you can only paste into is a place a link
 * goes to be forgotten. The button reads from what was last saved, not from
 * the input, so it never opens a half-typed URL.
 */
export function FileField({
  label,
  hint,
  value,
  onChange,
  saved,
  inputClass,
  leadId,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  saved: string | null;
  inputClass: string;
  leadId: string;
}) {
  return (
    <div>
      <p className="text-xs text-white/50 mb-1 font-medium">{label}</p>
      <p className="text-[11px] text-white/30 mb-1.5">{hint}</p>
      <div className="flex gap-2">
        {/* Either a pasted link or the PDF itself — the file is usually on
            somebody's desktop, not already hosted somewhere. */}
        <div className="flex-1 min-w-0">
          <PdfOrLinkField
            value={value}
            onChange={onChange}
            leadId={leadId}
            label={label}
            inputClass={`${inputClass} text-sm`}
          />
        </div>
        {saved && (
          <a
            href={saved}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/5 transition-colors whitespace-nowrap"
          >
            <FileText size={13} /> Open
          </a>
        )}
      </div>
    </div>
  );
}

// One message for every quick save on this page, because they all fail the
// same way: the data on screen looks saved and isn't.
export const SAVE_ERROR_MESSAGE = "Couldn't save — your changes are NOT stored. Try again.";

/**
 * Each step of the brief folds away so a long brief can be skimmed. Open by
 * default — nothing is hidden unless he chooses to hide it. Module-scoped
 * (like FileField above) so its identity is stable across renders and
 * toggling a fold never remounts what's below it.
 */
export function Step({
  n,
  title,
  hint,
  foldedSteps,
  setFoldedSteps,
}: {
  n: number;
  title: string;
  hint: string;
  foldedSteps: Set<number>;
  setFoldedSteps: Dispatch<SetStateAction<Set<number>>>;
}) {
  const folded = foldedSteps.has(n);
  return (
    <button
      onClick={() =>
        setFoldedSteps((prev) => {
          const next = new Set(prev);
          if (next.has(n)) next.delete(n);
          else next.add(n);
          return next;
        })
      }
      className="w-full flex items-start gap-3 mb-3 text-left"
    >
      <span className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-[11px] font-bold text-white/70">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-white/90">{title}</h3>
        <p className="text-xs text-white/40 mt-0.5">{hint}</p>
      </div>
      <ChevronRight
        size={16}
        className={`shrink-0 mt-0.5 text-white/30 transition-transform ${folded ? '' : 'rotate-90'}`}
      />
    </button>
  );
}

/**
 * Everything SectionNote needs from the page besides which section it sits
 * under. Bundled into one shape so the page can build it once and every call
 * site (including PricedCard, which forwards it) stays in sync.
 */
export interface SectionNoteSharedProps {
  activities: Activity[];
  drafts: Record<string, string>;
  setDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  objection: Record<string, boolean>;
  setObjection: Dispatch<SetStateAction<Record<string, boolean>>>;
  saving: Record<string, boolean>;
  justLogged: Record<string, boolean>;
  error: Record<string, string>;
  onLog: (sectionLabel: string) => void;
}

/**
 * One note box, shared by every card in the brief. Pain points had no way to
 * record what was said about them while the priced items did — so the same
 * conversation got written down in one place and lost in the other, depending
 * on which box prompted it. Module-scoped so a keystroke in the textarea
 * never remounts it and drops focus — all state lives on the page and
 * arrives as props.
 */
export function SectionNote({
  pointKey,
  activities,
  drafts,
  setDrafts,
  objection,
  setObjection,
  saving,
  justLogged,
  error,
  onLog,
}: SectionNoteSharedProps & { pointKey: string }) {
  return (
    <div className="mt-4 rounded-lg border-2 border-dashed border-sky-400/40 bg-sky-400/[0.06] p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-sky-300 mb-2">
        <StickyNote size={13} /> Their feedback on this
      </p>
      {(() => {
        const prefix = `[${pointKey}]`;
        const lastNote = activities
          .filter((a) => a.content.startsWith(prefix))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        if (!lastNote) return null;
        return (
          <p className="text-xs text-white/60 leading-relaxed mb-2 break-words">
            <span className="font-semibold text-white/80">Last time: </span>
            {lastNote.content.slice(prefix.length).trim()}
            <span className="text-white/35"> · {new Date(lastNote.createdAt).toLocaleDateString()}</span>
          </p>
        );
      })()}
      <textarea
        value={drafts[pointKey] || ''}
        onChange={(e) => setDrafts((prev) => ({ ...prev, [pointKey]: e.target.value }))}
        placeholder="What did they say about this?"
        rows={2}
        className="w-full px-2.5 py-2 rounded-md bg-black/30 border border-sky-400/25 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-sky-400/60 resize-none"
      />
      <div className="flex items-center justify-between mt-2">
        <label className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!objection[pointKey]}
            onChange={(e) => setObjection((prev) => ({ ...prev, [pointKey]: e.target.checked }))}
          />
          This was an objection
        </label>
        <button
          onClick={() => onLog(pointKey)}
          disabled={saving[pointKey] || !(drafts[pointKey] || '').trim()}
          className="px-4 py-1.5 rounded-md bg-emerald-400 text-black text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {saving[pointKey] ? 'Logging...' : 'Log to timeline'}
        </button>
      </div>
      {justLogged[pointKey] && (
        <p className="text-xs font-semibold text-emerald-300 mt-1.5">Logged ✓</p>
      )}
      {error[pointKey] && (
        <p className="text-xs text-red-300 mt-1.5">{error[pointKey]}</p>
      )}
    </div>
  );
}

/**
 * A priced line item: their bespoke wording, then everything a rep needs if
 * the customer pushes back on it — cost, what it actually is, the words to
 * sell it, and why the price is fair. Module-scoped for the same reason as
 * SectionNote: defined inside the render it remounted on every keystroke.
 */
export function PricedCard({
  i,
  tone,
  company,
  collapsedItems,
  setCollapsedItems,
  sectionNote,
}: {
  i: PricedItem;
  tone: 'green' | 'amber';
  company: string;
  collapsedItems: Set<string>;
  setCollapsedItems: Dispatch<SetStateAction<Set<string>>>;
  sectionNote: SectionNoteSharedProps;
}) {
  // Everything shows by default. Collapsing is there for scanning a
  // long list, not a default — hiding the pitch and the note box to
  // save scrolling removed the reason the page exists.
  const open = !collapsedItems.has(i.point);
  const toggle = () =>
    setCollapsedItems((prev) => {
      const next = new Set(prev);
      if (next.has(i.point)) next.delete(i.point);
      else next.add(i.point);
      return next;
    });
  const c =
    tone === 'green'
      ? { box: 'border-emerald-400/20 bg-emerald-400/[0.05]', head: 'text-emerald-100', price: 'text-emerald-300' }
      : { box: 'border-amber-400/20 bg-amber-400/[0.05]', head: 'text-amber-100', price: 'text-amber-300' };
  return (
    <div className={`rounded-xl border p-3 min-w-0 ${c.box}`}>
      <button onClick={toggle} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <p className={`text-sm font-bold break-words ${c.head}`}>{i.point}</p>
          <span className="shrink-0 flex items-center gap-1.5">
            {i.priceCents !== null && i.priceCents > 0 ? (
              <span className="flex items-center gap-1.5">
                {/* A price we invented reads identically to one from
                    the catalogue unless it says so. Saying so is the
                    difference between quoting and guessing. */}
                {i.isCustom && (
                  <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">
                    Custom
                  </span>
                )}
                <span className={`text-sm font-bold whitespace-nowrap ${c.price}`}>
                  {tone === 'amber' ? '+' : ''}
                  {formatCents(i.priceCents)}
                </span>
              </span>
            ) : i.priceCents === 0 ? (
              // An umbrella line for the items beneath it — "$0" would
              // read as free, which is the opposite of what it means.
              <span className="text-xs font-semibold whitespace-nowrap text-white/35">Priced below</span>
            ) : (
              // A blank where a price should be reads as an oversight,
              // and leaves the rep with nothing to say if asked.
              <span className="text-xs font-bold whitespace-nowrap text-white/45">Price: TBD</span>
            )}
            {i.entry && (
              <ChevronRight
                size={13}
                className={`text-white/30 transition-transform ${open ? 'rotate-90' : ''}`}
              />
            )}
          </span>
        </div>
        {i.explanation && (
          <p
            className={`text-xs text-white/60 leading-relaxed mt-1.5 break-words ${
              open ? '' : 'line-clamp-1'
            }`}
          >
            {i.explanation}
          </p>
        )}

      </button>
      {i.priceCents === null && open && (
        <div className="mt-2.5 rounded-lg border-l-2 border-amber-400/50 bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-amber-300/80 font-semibold mb-1">
            If they ask what this costs
          </p>
          <p className="text-xs text-white/80 italic leading-relaxed break-words">
            "This one depends on how much there is to do — how many pages, how much of your data moves
            across, that sort of thing. I'll come back to you with a figure once I know, and it's fixed
            before we start. You won't get a surprise on the invoice."
          </p>
        </div>
      )}

      {i.entry && open && (
        <>
          <div className="mt-2.5 rounded-lg bg-white/[0.03] px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-white/40 font-semibold mb-1">
              In plain English
            </p>
            <p className="text-xs text-white/70 leading-relaxed break-words">{i.entry.whatItIs}</p>
          </div>
          {i.entry.benefit && (
            <div className="mt-2 rounded-lg bg-white/[0.03] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-sky-300/80 font-semibold mb-1">
                How it helps {company}
              </p>
              <p className="text-xs text-white/70 leading-relaxed break-words">
                {personalise(i.entry.benefit, company)}
              </p>
            </div>
          )}
          <div className="mt-2 rounded-lg border-l-2 border-emerald-400/50 bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-emerald-300/80 font-semibold mb-1">
              Say something like this
            </p>
            <p className="text-xs text-white/80 italic leading-relaxed break-words">"{i.entry.pitch}"</p>
          </div>
          <p className="text-xs text-white/50 leading-relaxed mt-2.5 break-words">
            <span className="text-amber-300/90 font-semibold">If they ask why it costs that: </span>
            {i.entry.justification}
          </p>
          {i.entry.objection && (
            <p className="text-xs text-white/45 leading-relaxed mt-2 break-words">
              <span className="text-red-300/80 font-semibold">If they push back: </span>
              {i.entry.objection}
            </p>
          )}
        </>
      )}

      <SectionNote pointKey={i.point} {...sectionNote} />

    </div>
  );
}

/** The numbered heading over each step of the proposal builder. */
export function StepLabel({ n, label, hint }: { n: number; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/70">
        {n}
      </span>
      <h3 className="font-semibold text-sm">{label}</h3>
      {hint && <span className="text-xs text-white/35">{hint}</span>}
    </div>
  );
}
