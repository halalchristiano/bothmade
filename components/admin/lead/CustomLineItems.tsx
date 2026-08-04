'use client';

import { Trash2, Undo2 } from 'lucide-react';
import { MAX_CUSTOM_SCOPE_CHARS, MIN_CUSTOM_SCOPE_CHARS, formatCents, type CustomItem } from '@/lib/pricing';
import { StepLabel } from '@/components/admin/lead/primitives';

/**
 * Step 3 of the proposal builder: work quoted outside the catalogue.
 *
 * Pulled out of the lead page as a unit because it is one. Everything here —
 * the draft fields, the list, the undo — exists to serve a single rule: a
 * custom line cannot be added without a written scope, because that
 * description is quoted into the contract word for word, and "custom
 * integration" means whatever each of the two people on the call assumed it
 * meant right up until the build is underway.
 */
export function CustomLineItems({
  customItems,
  draftCustomLabel,
  setDraftCustomLabel,
  draftCustomPrice,
  setDraftCustomPrice,
  draftCustomDescription,
  setDraftCustomDescription,
  draftCustomScopeShort,
  lastRemovedCustomItem,
  addCustomItem,
  removeCustomItem,
  undoRemoveCustomItem,
  setCustomItemDescription,
  formatCurrencyInputValue,
  inputClass,
}: {
  customItems: CustomItem[];
  draftCustomLabel: string;
  setDraftCustomLabel: (v: string) => void;
  draftCustomPrice: string;
  setDraftCustomPrice: (v: string) => void;
  draftCustomDescription: string;
  setDraftCustomDescription: (v: string) => void;
  draftCustomScopeShort: boolean;
  lastRemovedCustomItem: { index: number; item: CustomItem } | null;
  addCustomItem: () => void;
  removeCustomItem: (index: number) => void;
  undoRemoveCustomItem: () => void;
  setCustomItemDescription: (index: number, description: string) => void;
  formatCurrencyInputValue: (raw: string) => string;
  inputClass: string;
}) {
  return (
            <div>
              <StepLabel n={3} label="Custom Work" hint={customItems.length ? `${customItems.length} added` : 'optional'} />
              <p className="text-xs text-white/45 mb-3 -mt-1">
                Anything quoted outside the catalogue. Write down what it actually covers — that description goes
                into the contract word for word, so "custom X" can only mean one thing later.
              </p>
              <div className="space-y-2 mb-3">
                {customItems.map((item, i) => {
                  const needsScope = item.description.trim().length < MIN_CUSTOM_SCOPE_CHARS;
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border-2 p-3 ${
                        needsScope ? 'border-red-400/50 bg-red-400/10' : 'border-amber-400/40 bg-amber-400/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium">{item.label}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-medium text-amber-200">{formatCents(item.priceCents)}</span>
                          <button
                            onClick={() => removeCustomItem(i)}
                            aria-label={`Remove ${item.label}`}
                            className="text-white/40 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {/* Editable in place: items saved before descriptions
                          were required arrive blank, and the fix belongs
                          right where the gap is visible. */}
                      <textarea
                        value={item.description}
                        onChange={(e) => setCustomItemDescription(i, e.target.value)}
                        rows={2}
                        maxLength={MAX_CUSTOM_SCOPE_CHARS}
                        placeholder="What does this actually cover? e.g. Migrate the 400 existing blog posts into the new CMS, with redirects from the old URLs."
                        aria-label={`What "${item.label}" covers`}
                        className="mt-2 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-xs leading-relaxed text-white/85 placeholder:text-white/30 focus:border-white/30 focus:outline-none resize-y"
                      />
                      {needsScope && (
                        <p className="mt-1.5 text-[11px] text-red-300">
                          Needs at least {MIN_CUSTOM_SCOPE_CHARS} characters describing this work before a contract can
                          be generated or sent.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {lastRemovedCustomItem && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-white/5 p-2.5 mb-3 text-xs">
                  <span className="text-white/60">Removed "{lastRemovedCustomItem.item.label}"</span>
                  <button
                    onClick={undoRemoveCustomItem}
                    className="font-semibold text-sky-300 hover:text-sky-200 transition-colors"
                  >
                    Undo
                  </button>
                </div>
              )}

              <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Custom item name"
                    value={draftCustomLabel}
                    onChange={(e) => setDraftCustomLabel(e.target.value)}
                    className={`${inputClass.replace('w-full', '')} flex-1 min-w-0`}
                  />
                  <span className="relative w-28 shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={draftCustomPrice}
                      onChange={(e) => setDraftCustomPrice(formatCurrencyInputValue(e.target.value))}
                      className={`${inputClass.replace('w-full', '')} w-full pl-6`}
                    />
                  </span>
                </div>
                <textarea
                  value={draftCustomDescription}
                  onChange={(e) => setDraftCustomDescription(e.target.value)}
                  rows={3}
                  maxLength={MAX_CUSTOM_SCOPE_CHARS}
                  placeholder="What does this cover? Be specific enough that the client couldn't read it two ways — e.g. Migrate the 400 existing blog posts into the new CMS, with redirects from the old URLs. Excludes rewriting the copy."
                  aria-label="What this custom work covers"
                  className={`${inputClass} text-xs leading-relaxed resize-y`}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-white/40">
                    {draftCustomDescription.trim().length === 0
                      ? 'This wording is what goes into the contract.'
                      : draftCustomScopeShort
                        ? `${MIN_CUSTOM_SCOPE_CHARS - draftCustomDescription.trim().length} more characters — say what's actually included.`
                        : 'Goes into the contract as the definitive scope for this item.'}
                  </p>
                  <button
                    onClick={addCustomItem}
                    disabled={!draftCustomLabel.trim() || !draftCustomPrice || draftCustomScopeShort}
                    className="shrink-0 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-white/5 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
  );
}
