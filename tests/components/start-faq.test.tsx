import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import StartPage from '@/app/start/page';
import { FAQ_ITEMS } from '@/lib/start-faq';

/**
 * The /start FAQ is published twice: once as the accordion a person reads, and
 * once as FAQPage structured data in app/start/layout.tsx. Those two have to
 * agree, and they did not.
 *
 * The accordion rendered its answer as `{open && <p>…}` with `openIndex`
 * starting at null — so the page a crawler fetches carried twelve questions,
 * twelve answers inside the JSON-LD, and not one answer anywhere in the
 * document. Structured data is a claim about what the page contains. Answers
 * hidden behind an accordion are explicitly acceptable; answers that do not
 * exist are a different thing.
 *
 * The same markup was also missing its disclosure semantics entirely — no
 * aria-expanded, so the control announced itself as a plain button with no
 * hint that it reveals anything and no announcement when it did.
 */

describe('every answer is in the document, open or not', () => {
  it('renders an answer element for all twelve questions while collapsed', () => {
    // The regression, stated directly: nothing is open on first paint, and
    // that used to mean nothing was rendered.
    render(<StartPage />);
    for (const item of FAQ_ITEMS) {
      expect(
        screen.getByText(item.a),
        `answer missing from the DOM: "${item.q}"`
      ).toBeInTheDocument();
    }
  });

  it('keeps them hidden until asked for', () => {
    // In the document for a crawler, out of the accessibility tree and off
    // the screen for a reader who has not opened it.
    render(<StartPage />);
    for (const item of FAQ_ITEMS) {
      expect(screen.getByText(item.a)).not.toBeVisible();
    }
  });

  it('matches the structured data one for one', () => {
    // If a question is ever added to the JSON-LD without reaching the
    // accordion, or vice versa, this is where it shows up.
    render(<StartPage />);
    for (const item of FAQ_ITEMS) {
      expect(screen.getByRole('button', { name: new RegExp(escapeRegExp(item.q)) })).toBeInTheDocument();
    }
  });
});

describe('the accordion says what it is doing', () => {
  it('starts with every question collapsed and says so', () => {
    render(<StartPage />);
    for (const item of FAQ_ITEMS) {
      const button = screen.getByRole('button', { name: new RegExp(escapeRegExp(item.q)) });
      expect(button).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('flips aria-expanded and reveals the answer on click', async () => {
    const user = userEvent.setup();
    render(<StartPage />);

    const first = FAQ_ITEMS[0];
    const button = screen.getByRole('button', { name: new RegExp(escapeRegExp(first.q)) });

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(first.a)).toBeVisible();

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(first.a)).not.toBeVisible();
  });

  it('points each button at the panel it controls', async () => {
    // aria-controls is what lets a screen reader jump from the question to
    // the answer it just opened.
    render(<StartPage />);
    for (const item of FAQ_ITEMS) {
      const button = screen.getByRole('button', { name: new RegExp(escapeRegExp(item.q)) });
      const panelId = button.getAttribute('aria-controls');
      expect(panelId, `no aria-controls on "${item.q}"`).toBeTruthy();
      expect(document.getElementById(panelId!), `aria-controls points at nothing`).not.toBeNull();
      expect(document.getElementById(panelId!)).toHaveTextContent(item.a.slice(0, 40));
    }
  });

  it('opens one at a time, closing the previous', async () => {
    // Existing behaviour, pinned so the aria work above cannot quietly change it.
    const user = userEvent.setup();
    render(<StartPage />);

    const [a, b] = FAQ_ITEMS;
    const buttonA = screen.getByRole('button', { name: new RegExp(escapeRegExp(a.q)) });
    const buttonB = screen.getByRole('button', { name: new RegExp(escapeRegExp(b.q)) });

    await user.click(buttonA);
    await user.click(buttonB);

    expect(buttonA).toHaveAttribute('aria-expanded', 'false');
    expect(buttonB).toHaveAttribute('aria-expanded', 'true');
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
