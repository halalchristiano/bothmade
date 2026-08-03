'use client';

import { useCallback, useState } from 'react';
import type { LeadStatus } from '@/lib/leads';

/**
 * Moving a lead between stages was written out four times — the leads list,
 * the pipeline board, the spreadsheet view, and the lead detail page — and
 * the four copies had quietly diverged: two rolled the optimistic update
 * back when the PATCH failed, one surfaced an error, one silently swallowed
 * it and left the UI showing a stage the server never recorded. This is the
 * one implementation of that sequence.
 *
 * `lost` is special: it can't be applied straight away because it needs a
 * reason, so the hook parks the lead in `lostTarget` for the caller to show
 * `LostReasonModal` against, and `confirmLost` finishes the job.
 */

export const STATUS_SAVE_FAILED = "Couldn't save that change — try again.";
export const STATUS_NETWORK_FAILED = 'Could not reach the server — check your connection and try again.';

export interface StatusChangeTarget {
  id: string;
  company: string;
  status: LeadStatus;
}

export interface UseLeadStatusChangeOptions<L extends StatusChangeTarget> {
  /**
   * Show `status` on the lead right now. Called with the new status
   * optimistically, and again with the old one if the save fails. Omit on
   * pages that reload from the server instead of tracking a local list.
   */
  applyStatus?: (lead: L, status: LeadStatus) => void;
  /** Fired once the server has confirmed the change — the place to refetch. */
  onSaved?: (lead: L, status: LeadStatus) => void;
  /** Which lead is mid-save, for per-row spinners. Null when nothing is in flight. */
  onSavingChange?: (leadId: string | null) => void;
}

export function useLeadStatusChange<L extends StatusChangeTarget>({
  applyStatus,
  onSaved,
  onSavingChange,
}: UseLeadStatusChangeOptions<L> = {}) {
  const [lostTarget, setLostTarget] = useState<L | null>(null);
  const [error, setError] = useState('');

  const save = useCallback(
    async (lead: L, status: LeadStatus, lostReason?: string) => {
      const previousStatus = lead.status;
      setError('');
      applyStatus?.(lead, status);
      onSavingChange?.(lead.id);
      try {
        const res = await fetch(`/api/admin/leads/${lead.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, ...(lostReason ? { lostReason } : {}) }),
        });
        if (!res.ok) {
          applyStatus?.(lead, previousStatus);
          setError(`Couldn't update ${lead.company} — the change didn't save. Try again.`);
          return false;
        }
        onSaved?.(lead, status);
        return true;
      } catch {
        applyStatus?.(lead, previousStatus);
        setError(STATUS_NETWORK_FAILED);
        return false;
      } finally {
        onSavingChange?.(null);
      }
    },
    [applyStatus, onSaved, onSavingChange]
  );

  /** The entry point for every stage change. Defers `lost` to the reason modal. */
  const changeStatus = useCallback(
    async (lead: L, status: LeadStatus) => {
      if (status === 'lost') {
        setError('');
        setLostTarget(lead);
        return false;
      }
      return save(lead, status);
    },
    [save]
  );

  const confirmLost = useCallback(
    async (reason: string) => {
      const lead = lostTarget;
      if (!lead) return false;
      setLostTarget(null);
      return save(lead, 'lost', reason);
    },
    [lostTarget, save]
  );

  const cancelLost = useCallback(() => setLostTarget(null), []);

  return { changeStatus, lostTarget, confirmLost, cancelLost, error, setError };
}
