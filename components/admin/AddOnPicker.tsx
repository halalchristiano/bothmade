'use client';

import InfoTooltip from '@/components/InfoTooltip';
import {
  ADD_ONS,
  ADD_ON_CATEGORIES,
  BASE_SERVICES,
  formatCents,
  isIncludedInBase,
  type AddOnCategory,
  type AddOnKey,
  type BaseService,
} from '@/lib/pricing';

/**
 * The catalogue pickers — one for the base service, one for the add-ons —
 * shared by the proposal builder on a lead and the manual project-creation
 * form. Both were hand-rolling the same selected/unselected gradient, the
 * same `formatCents` price line, and their own `Object.entries(...)` casts;
 * the manual form's copy had silently fallen behind and let someone tick an
 * add-on that a Web App's base price already includes, quoting it twice.
 */

const SELECTED_TILE = 'bg-gradient-to-r from-sky-400/20 to-purple-500/20 border-sky-400/40';
const UNSELECTED_TILE = 'border-white/10 hover:border-white/25 hover:bg-white/[0.03]';

const COLUMN_CLASS: Record<2 | 3, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
};

export function BaseServicePicker({
  value,
  onChange,
  columns = 2,
}: {
  value: BaseService;
  onChange: (key: BaseService) => void;
  columns?: 2 | 3;
}) {
  const entries = Object.entries(BASE_SERVICES) as [BaseService, (typeof BASE_SERVICES)[BaseService]][];
  return (
    <div role="radiogroup" aria-label="Base service" className={`grid grid-cols-1 ${COLUMN_CLASS[columns]} gap-3`}>
      {entries.map(([key, service]) => {
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(key)}
            className={`text-left rounded-xl p-3 border transition-colors ${selected ? SELECTED_TILE : UNSELECTED_TILE}`}
          >
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-sm">{service.label}</span>
              <InfoTooltip text={`${service.description} Best for: ${service.bestFor}`} />
            </span>
            <p className="text-xs text-white/40 mt-0.5">{formatCents(service.price)}</p>
          </button>
        );
      })}
    </div>
  );
}

function AddOnTile({
  addOnKey,
  checked,
  includedInBase,
  showDescription,
  onToggle,
}: {
  addOnKey: AddOnKey;
  checked: boolean;
  includedInBase: boolean;
  showDescription: boolean;
  onToggle: (key: AddOnKey) => void;
}) {
  const addOn = ADD_ONS[addOnKey];
  return (
    <label
      className={`flex items-start gap-2 rounded-lg p-3 border transition-colors ${
        includedInBase ? 'cursor-default' : 'cursor-pointer'
      } ${checked ? SELECTED_TILE : UNSELECTED_TILE}`}
    >
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={() => onToggle(addOnKey)}
        disabled={includedInBase}
      />
      <span className="flex-1">
        <span className="text-sm flex items-center gap-1.5">
          {addOn.label}
          <InfoTooltip text={`${addOn.description} ${addOn.benefit}`} />
        </span>
        {showDescription && <span className="text-xs text-white/35">{addOn.description}</span>}
      </span>
      {includedInBase ? (
        <span className="text-xs text-emerald-300 whitespace-nowrap">Included</span>
      ) : (
        <span className="text-xs text-white/40 whitespace-nowrap">+{formatCents(addOn.price)}</span>
      )}
    </label>
  );
}

export function AddOnPicker({
  baseService,
  selected,
  onToggle,
  /** Grouped by category for the full proposal builder; flat for the quicker form. */
  grouped = true,
  showDescriptions = true,
}: {
  baseService: BaseService;
  selected: AddOnKey[];
  onToggle: (key: AddOnKey) => void;
  grouped?: boolean;
  showDescriptions?: boolean;
}) {
  const allEntries = Object.entries(ADD_ONS) as [AddOnKey, (typeof ADD_ONS)[AddOnKey]][];

  const tile = (key: AddOnKey) => (
    <AddOnTile
      key={key}
      addOnKey={key}
      checked={selected.includes(key)}
      includedInBase={isIncludedInBase(baseService, key)}
      showDescription={showDescriptions}
      onToggle={onToggle}
    />
  );

  if (!grouped) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{allEntries.map(([key]) => tile(key))}</div>
    );
  }

  const categories = Object.entries(ADD_ON_CATEGORIES) as [
    AddOnCategory,
    (typeof ADD_ON_CATEGORIES)[AddOnCategory],
  ][];

  return (
    <div className="space-y-4">
      {categories.map(([catKey, cat]) => {
        const inCategory = allEntries.filter(([, a]) => a.category === catKey);
        if (inCategory.length === 0) return null;
        return (
          <div key={catKey}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/35 mb-2">{cat.label}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{inCategory.map(([key]) => tile(key))}</div>
          </div>
        );
      })}
    </div>
  );
}
