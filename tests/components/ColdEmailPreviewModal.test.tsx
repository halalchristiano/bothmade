import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColdEmailPreviewModal } from '@/components/admin/ColdEmailPreviewModal';

/**
 * The skip toggle worked but looked broken: the whole card faded to
 * `opacity-40` when skipped, and the button lives inside that card, so the
 * one control that undoes the skip faded out with it. These tests pin the
 * button's legibility and its fixed width, not just its behaviour.
 */

const leads = [
  {
    id: 'lead_1',
    company: 'Northwind Dental',
    contactName: 'Dana',
    email: 'dana@northwinddental.test',
    coldEmailDraft: null,
    painPoints: 'no online booking',
    personalizedObservation: null,
  },
  {
    id: 'lead_2',
    company: 'Harbor Point Landscaping',
    contactName: 'Sam',
    email: 'sam@harborpointland.test',
    coldEmailDraft: null,
    painPoints: 'no quote form',
    personalizedObservation: null,
  },
];

function renderModal(overrides: Partial<Parameters<typeof ColdEmailPreviewModal>[0]> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ColdEmailPreviewModal
      leads={leads}
      sending={false}
      gmailConnected
      onClose={onClose}
      onConfirm={onConfirm}
      {...overrides}
    />
  );
  return { onConfirm, onClose };
}

/** The card wrapping a lead's preview — the element that used to carry the fade. */
function cardFor(company: string) {
  const card = screen.getByText(company).closest('div.rounded-xl');
  if (!card) throw new Error(`no card for ${company}`);
  return card as HTMLElement;
}

function skipButtonFor(company: string) {
  return within(cardFor(company)).getByRole('button');
}

/** Walks up from the button looking for a dimming class on any ancestor. */
function isDimmed(el: HTMLElement) {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (/(^|\s)opacity-(0|5|10|20|25|30|40|50)(\s|$)/.test(node.className)) return true;
  }
  return false;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) })));
});

describe('skipping a cold email in the preview', () => {
  it('keeps the undo control at full opacity once the card is skipped', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(skipButtonFor('Northwind Dental'));

    const button = skipButtonFor('Northwind Dental');
    expect(button).toHaveAccessibleName(/undo skip/i);
    expect(isDimmed(button)).toBe(false);
  });

  it('dims the preview body it is skipping', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(skipButtonFor('Northwind Dental'));

    expect(isDimmed(screen.getByText(/Hi Dana/))).toBe(true);
    expect(isDimmed(screen.getByText(/Hi Sam/))).toBe(false);
  });

  it('does not resize the button when the label swaps, so the row stays put', async () => {
    const user = userEvent.setup();
    renderModal();

    const widthClass = (el: HTMLElement) => el.className.match(/(?:^|\s)w-\S+/)?.[0].trim();
    const before = widthClass(skipButtonFor('Northwind Dental'));

    await user.click(skipButtonFor('Northwind Dental'));

    expect(before).toBeDefined();
    expect(widthClass(skipButtonFor('Northwind Dental'))).toBe(before);
    // And it matches the still-unskipped sibling, so the column stays aligned.
    expect(widthClass(skipButtonFor('Harbor Point Landscaping'))).toBe(before);
  });

  it('exposes the skip state to assistive tech', async () => {
    const user = userEvent.setup();
    renderModal();

    expect(skipButtonFor('Northwind Dental')).toHaveAttribute('aria-pressed', 'false');
    await user.click(skipButtonFor('Northwind Dental'));
    expect(skipButtonFor('Northwind Dental')).toHaveAttribute('aria-pressed', 'true');
  });

  it('sends only the leads that were not skipped', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal();

    await user.click(skipButtonFor('Northwind Dental'));
    expect(screen.getByText('1 of 2 will send (1 skipped).')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Send 1 now/ }));
    expect(onConfirm).toHaveBeenCalledWith(['lead_2']);
  });

  it('puts a skipped lead back in the send after undo', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal();

    await user.click(skipButtonFor('Northwind Dental'));
    await user.click(skipButtonFor('Northwind Dental'));

    expect(screen.getByText('2 of 2 will send.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Send 2 now/ }));
    expect(onConfirm).toHaveBeenCalledWith(['lead_1', 'lead_2']);
  });

  it('will not send when every lead is skipped', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(skipButtonFor('Northwind Dental'));
    await user.click(skipButtonFor('Harbor Point Landscaping'));

    expect(screen.getByRole('button', { name: /Send 0 now/ })).toBeDisabled();
  });
});
