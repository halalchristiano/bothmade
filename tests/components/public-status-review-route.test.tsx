import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * The panel that tells a client they are the holdup.
 *
 * It says nothing moves until they have had their say, and — when the review
 * window is set — gives a date on which their silence becomes a yes. Both are
 * true and worth saying. It then offered no way whatsoever to say the yes.
 *
 * Approving lives on the client dashboard, behind a login. The premise of
 * this page is that it needs none: the link came out of an email, on a phone.
 * A review window running out because somebody could not find their password
 * is the most avoidable version of that deadline being missed.
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ projectId: 'p_northgate' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import PublicStatusPage from '@/app/status/[projectId]/page';

const base = {
  name: 'Northgate — Website',
  company: 'Northgate Dental',
  statusStage: 1,
  estimatedCompletionDate: null,
  liveUrl: null,
  updates: [],
};

function serve(project: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, project }) }) as unknown as Response)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/status/p_northgate?t=tok_northgate');
});

describe('a design waiting on the client', () => {
  it('offers a way to go and approve it', async () => {
    serve({ ...base, awaitingYourReview: { presentedAt: '2026-08-05T10:00:00.000Z', reviewEndsAt: '2026-08-12T10:00:00.000Z' } });
    render(<PublicStatusPage />);

    const link = await screen.findByRole('link', { name: /review it in your dashboard/i });
    expect(link).toHaveAttribute('href', '/client/p_northgate');
  });

  /*
   * The deadline is the reason the link matters, but the link is not
   * conditional on it: a review with no window set still needs somewhere to
   * go, and that is the case where nothing else is chasing them at all.
   */
  it('offers it even when no review window has been set', async () => {
    serve({ ...base, awaitingYourReview: { presentedAt: '2026-08-05T10:00:00.000Z', reviewEndsAt: null } });
    render(<PublicStatusPage />);

    expect(await screen.findByRole('link', { name: /review it in your dashboard/i })).toBeInTheDocument();
  });
});

describe('a project not waiting on anybody', () => {
  it('does not send them anywhere', async () => {
    serve({ ...base, statusStage: 2, awaitingYourReview: null });
    render(<PublicStatusPage />);

    await screen.findByText(/Northgate — Website/);
    expect(screen.queryByRole('link', { name: /review it in your dashboard/i })).toBeNull();
  });
});
