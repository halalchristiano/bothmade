import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesignReviewPanel } from '@/components/admin/DesignReviewPanel';

/**
 * The design panel, when the request never lands.
 *
 * All three actions here were written as `try { … } finally { setBusy(false) }`
 * with no `catch`. A network failure threw straight out of the handler: the
 * spinner stopped, nothing was said, and the panel looked exactly as it had
 * before the press.
 *
 * That silence is worst on Present. It is the act that starts the Section 4
 * clock — the five business days whose expiry turns a client's silence into
 * approval and Payment 2 into money owed. "Did that actually send?" is not a
 * question this screen should ever leave somebody holding.
 *
 * And on approval there is the opposite problem: it succeeds and has
 * something to say. Section 7 puts Payment 2 on that exact moment, and the
 * panel was dropping the route's answer on the floor.
 */

const EMPTY = { presentedAt: null, reviewEndsAt: null, approvedAt: null, deemed: false };

/** The clock running, so the Approve control is the one on screen. */
const RUNNING = {
  presentedAt: '2026-08-01T09:00:00.000Z',
  reviewEndsAt: '2026-08-08T09:00:00.000Z',
  approvedAt: null,
  deemed: false,
};

function panel(review: typeof EMPTY | typeof RUNNING, onGateOpened = vi.fn()) {
  const onChanged = vi.fn();
  render(
    <DesignReviewPanel
      projectId="proj_1"
      review={review as never}
      onChanged={onChanged}
      onGateOpened={onGateOpened}
    />
  );
  return { onChanged, onGateOpened };
}

/** A fetch that dies the way a real one does when the network is gone. */
function networkDown() {
  const f = vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  });
  vi.stubGlobal('fetch', f as unknown as typeof fetch);
  return f;
}

function responds(body: unknown, ok = true) {
  const f = vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }));
  vi.stubGlobal('fetch', f as unknown as typeof fetch);
  return f;
}

const present = () => screen.getByRole('button', { name: /send .* for review/i });
const approve = () => screen.getByRole('button', { name: /approved/i });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('presenting a design when the network is gone', () => {
  it('says so, instead of looking like nothing happened', async () => {
    networkDown();
    panel(EMPTY);

    await userEvent.click(present());

    const said = await screen.findByText(/could not reach the server/i);
    // The half that matters: what it means for the contract clock.
    expect(said).toHaveTextContent(/review clock has not started/i);
  });

  it('does not tell the page anything changed', async () => {
    networkDown();
    const { onChanged } = panel(EMPTY);

    await userEvent.click(present());
    await screen.findByText(/could not reach the server/i);

    expect(onChanged).not.toHaveBeenCalled();
  });

  it('lets go of the button, so it can be tried again', async () => {
    networkDown();
    panel(EMPTY);

    await userEvent.click(present());
    await screen.findByText(/could not reach the server/i);

    await waitFor(() => expect(present()).toBeEnabled());
  });
});

describe('recording an approval', () => {
  it('says so when the request never lands', async () => {
    networkDown();
    panel(RUNNING);

    await userEvent.click(approve());

    expect(await screen.findByText(/approval was not recorded/i)).toBeInTheDocument();
  });

  /**
   * Section 7 puts Payment 2 on Design Approval. The route reports it; this
   * is the panel handing it on rather than dropping it.
   */
  it('passes the payment it just made due up to the page', async () => {
    const gate = {
      instalmentId: 'i2',
      index: 2,
      label: 'Payment 2 of 3',
      amountCents: 180000,
      claim: 'Design Approval',
      stage: 'build',
      lead: 'Havisham Joinery approved the design.',
      clause: 'Section 7',
      clauseText: 'Payment 2 is due on Design Approval…',
    };
    responds({ success: true, approvedAt: '2026-08-08T09:00:00.000Z', gateOpened: gate });
    const { onGateOpened, onChanged } = panel(RUNNING);

    await userEvent.click(approve());

    await waitFor(() => expect(onGateOpened).toHaveBeenCalledWith(gate));
    expect(onChanged).toHaveBeenCalled();
  });

  it('prompts for nothing when the route reports no gate', async () => {
    responds({ success: true, approvedAt: '2026-08-08T09:00:00.000Z', gateOpened: null });
    const { onGateOpened, onChanged } = panel(RUNNING);

    await userEvent.click(approve());

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onGateOpened).not.toHaveBeenCalled();
  });

  it('shows the route’s own refusal when it has one', async () => {
    responds({ error: 'The design on this project is already approved.' }, false);
    panel(RUNNING);

    await userEvent.click(approve());

    expect(
      await screen.findByText(/already approved/i)
    ).toBeInTheDocument();
  });
});
