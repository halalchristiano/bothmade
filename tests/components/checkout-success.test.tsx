import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CheckoutSuccessPage from '@/app/checkout/success/page';

/**
 * One page is the redirect target for two different payments, and they are
 * not the same event.
 *
 * A first payment creates the client's account and emails them a temporary
 * password. A balance payment is made by someone who has had a dashboard for
 * weeks. Telling the second person "we've created your account, check your
 * inbox for a password" sends them looking for an email that was never sent
 * — at the exact moment they have just handed over money and most want to
 * believe the process is in order.
 */

// The tracker is a Vercel Analytics side effect, not part of the copy.
vi.mock('@/app/checkout/success/PurchaseTrack', () => ({
  PurchaseTrack: () => null,
}));

/**
 * And the page a client lands on with the money already gone.
 *
 * Every other screen in this business is dark — the portal, the status page,
 * the unsubscribe page, both error pages. This one was white cards on a grey
 * gradient with no wordmark on it at all: a generic receipt template, shown
 * at the single moment somebody has handed over the largest sum they will
 * ever send us, by a studio that sells design.
 */
describe('the page that greets a payment', () => {
  it('carries the studio the client just paid', async () => {
    await renderPage({ type: 'welcome' });

    expect(screen.getByText('Bothmade')).toBeInTheDocument();
  });

  it('is the same dark surface as everything else the client has seen', async () => {
    const { container } = render(await CheckoutSuccessPage({ searchParams: Promise.resolve({}) }));

    expect(container.querySelector('main')?.className).toContain('bg-[#05030a]');
  });

  it('is dark for a care plan too, which is a different branch of the page', async () => {
    const { container } = render(
      await CheckoutSuccessPage({ searchParams: Promise.resolve({ type: 'care' }) })
    );

    expect(container.querySelector('main')?.className).toContain('bg-[#05030a]');
    expect(screen.getByText('Bothmade')).toBeInTheDocument();
  });
});

/** The page is async and takes searchParams as a promise, as Next 16 hands them over. */
async function renderPage(params: { type?: string }) {
  render(await CheckoutSuccessPage({ searchParams: Promise.resolve(params) }));
}

describe('a first payment', () => {
  it('tells them an account was made and a password sent', async () => {
    await renderPage({ type: 'welcome' });

    expect(screen.getByText(/created your account/i)).toBeInTheDocument();
    expect(screen.getByText(/temporary password/i)).toBeInTheDocument();
  });

  it('points at the login, since they have never signed in', async () => {
    await renderPage({ type: 'welcome' });

    expect(screen.getByRole('link', { name: /client login/i })).toBeInTheDocument();
  });
});

describe('a balance payment', () => {
  it('does not claim to have created an account they already had', async () => {
    await renderPage({});

    expect(screen.queryByText(/created your account/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/temporary password/i)).not.toBeInTheDocument();
  });

  it('says the payment will show on the project, and sends them to the dashboard', async () => {
    await renderPage({});

    expect(screen.getByText(/show up on your project/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /your dashboard/i })).toBeInTheDocument();
  });

  it('treats an unrecognised type as a balance payment, not a welcome', async () => {
    // The wrong message costs more in the welcome direction: a returning
    // client hunting for a password email. So anything that isn't explicitly
    // a welcome is treated as the safer of the two.
    await renderPage({ type: 'something-else' });

    expect(screen.queryByText(/temporary password/i)).not.toBeInTheDocument();
  });
});

describe('both payments', () => {
  it('confirm the money arrived, which is the one thing they came to check', async () => {
    for (const type of ['welcome', undefined]) {
      const { unmount } = render(
        await CheckoutSuccessPage({ searchParams: Promise.resolve({ type }) })
      );
      expect(screen.getByRole('heading', { name: /payment received/i })).toBeInTheDocument();
      unmount();
    }
  });
});
