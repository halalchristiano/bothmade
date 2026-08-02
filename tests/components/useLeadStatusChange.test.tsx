import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLeadStatusChange } from '@/components/admin/useLeadStatusChange';
import type { LeadStatus } from '@/lib/leads';

/**
 * This hook replaced four hand-written copies of the same sequence, two of
 * which had lost the rollback and one of which swallowed failures entirely.
 * These tests are the reason the four can't drift apart again.
 */

const LEAD = { id: 'lead_1', company: 'Linpotia Cafe', status: 'new' as LeadStatus };

function mockFetch(impl: () => Promise<{ ok: boolean }> | never) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('a successful change', () => {
  it('PATCHes the lead with the new status', async () => {
    const fetchMock = mockFetch(async () => ({ ok: true }));
    const { result } = renderHook(() => useLeadStatusChange());

    await act(async () => {
      await result.current.changeStatus(LEAD, 'qualified');
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/leads/lead_1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'qualified' }),
    });
  });

  it('applies the change optimistically and leaves it applied', async () => {
    mockFetch(async () => ({ ok: true }));
    const applyStatus = vi.fn();
    const { result } = renderHook(() => useLeadStatusChange({ applyStatus }));

    await act(async () => {
      await result.current.changeStatus(LEAD, 'qualified');
    });

    expect(applyStatus).toHaveBeenCalledExactlyOnceWith(LEAD, 'qualified');
    expect(result.current.error).toBe('');
  });

  it('reports the save so the page can refetch', async () => {
    mockFetch(async () => ({ ok: true }));
    const onSaved = vi.fn();
    const { result } = renderHook(() => useLeadStatusChange({ onSaved }));

    await act(async () => {
      await result.current.changeStatus(LEAD, 'qualified');
    });

    expect(onSaved).toHaveBeenCalledExactlyOnceWith(LEAD, 'qualified');
  });

  it('brackets the request with the saving flag, for per-row spinners', async () => {
    mockFetch(async () => ({ ok: true }));
    const onSavingChange = vi.fn();
    const { result } = renderHook(() => useLeadStatusChange({ onSavingChange }));

    await act(async () => {
      await result.current.changeStatus(LEAD, 'qualified');
    });

    expect(onSavingChange.mock.calls).toEqual([['lead_1'], [null]]);
  });
});

describe('a failed change', () => {
  it('rolls the row back to the stage the server actually has', async () => {
    mockFetch(async () => ({ ok: false }));
    const applyStatus = vi.fn();
    const { result } = renderHook(() => useLeadStatusChange({ applyStatus }));

    await act(async () => {
      await result.current.changeStatus(LEAD, 'qualified');
    });

    expect(applyStatus.mock.calls).toEqual([
      [LEAD, 'qualified'],
      [LEAD, 'new'],
    ]);
  });

  it('names the lead in the error, so a bulk screen says which one failed', async () => {
    mockFetch(async () => ({ ok: false }));
    const { result } = renderHook(() => useLeadStatusChange());

    await act(async () => {
      await result.current.changeStatus(LEAD, 'qualified');
    });

    await waitFor(() => expect(result.current.error).toContain('Linpotia Cafe'));
  });

  it('never reports the change as saved', async () => {
    mockFetch(async () => ({ ok: false }));
    const onSaved = vi.fn();
    const { result } = renderHook(() => useLeadStatusChange({ onSaved }));

    await act(async () => {
      await result.current.changeStatus(LEAD, 'qualified');
    });

    expect(onSaved).not.toHaveBeenCalled();
  });

  it('rolls back and explains when the network is unreachable', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const applyStatus = vi.fn();
    const onSavingChange = vi.fn();
    const { result } = renderHook(() => useLeadStatusChange({ applyStatus, onSavingChange }));

    await act(async () => {
      await result.current.changeStatus(LEAD, 'qualified');
    });

    expect(applyStatus).toHaveBeenLastCalledWith(LEAD, 'new');
    expect(result.current.error).toMatch(/could not reach the server/i);
    // The spinner must clear even on the throwing path.
    expect(onSavingChange).toHaveBeenLastCalledWith(null);
  });
});

describe('marking a lead lost', () => {
  it('asks for a reason instead of saving straight away', async () => {
    const fetchMock = mockFetch(async () => ({ ok: true }));
    const applyStatus = vi.fn();
    const { result } = renderHook(() => useLeadStatusChange({ applyStatus }));

    await act(async () => {
      await result.current.changeStatus(LEAD, 'lost');
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(applyStatus).not.toHaveBeenCalled();
    expect(result.current.lostTarget).toEqual(LEAD);
  });

  it('sends the reason along with the status once confirmed', async () => {
    const fetchMock = mockFetch(async () => ({ ok: true }));
    const { result } = renderHook(() => useLeadStatusChange());

    await act(async () => {
      await result.current.changeStatus(LEAD, 'lost');
    });
    await act(async () => {
      await result.current.confirmLost('Too expensive');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/leads/lead_1',
      expect.objectContaining({
        body: JSON.stringify({ status: 'lost', lostReason: 'Too expensive' }),
      })
    );
    expect(result.current.lostTarget).toBeNull();
  });

  it('drops the pending lead when cancelled, changing nothing', async () => {
    const fetchMock = mockFetch(async () => ({ ok: true }));
    const { result } = renderHook(() => useLeadStatusChange());

    await act(async () => {
      await result.current.changeStatus(LEAD, 'lost');
    });
    act(() => result.current.cancelLost());

    expect(result.current.lostTarget).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when confirmed with no lead pending', async () => {
    const fetchMock = mockFetch(async () => ({ ok: true }));
    const { result } = renderHook(() => useLeadStatusChange());

    await act(async () => {
      await result.current.confirmLost('Too expensive');
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rolls back to the pre-lost stage if the save fails', async () => {
    mockFetch(async () => ({ ok: false }));
    const applyStatus = vi.fn();
    const qualified = { ...LEAD, status: 'qualified' as LeadStatus };
    const { result } = renderHook(() => useLeadStatusChange({ applyStatus }));

    await act(async () => {
      await result.current.changeStatus(qualified, 'lost');
    });
    await act(async () => {
      await result.current.confirmLost('Went quiet');
    });

    expect(applyStatus.mock.calls).toEqual([
      [qualified, 'lost'],
      [qualified, 'qualified'],
    ]);
  });
});

describe('error clearing', () => {
  it('clears a stale error when the next change starts', async () => {
    const fetchMock = mockFetch(async () => ({ ok: false }));
    const { result } = renderHook(() => useLeadStatusChange());

    await act(async () => {
      await result.current.changeStatus(LEAD, 'qualified');
    });
    expect(result.current.error).not.toBe('');

    fetchMock.mockImplementation(async () => ({ ok: true }));
    await act(async () => {
      await result.current.changeStatus(LEAD, 'contacted');
    });

    expect(result.current.error).toBe('');
  });
});
