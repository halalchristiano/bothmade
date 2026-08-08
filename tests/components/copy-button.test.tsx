import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyButton } from '@/components/admin/CopyButton';

/**
 * "Copy pay link" copied silently, and threw where it could not.
 *
 * `navigator.clipboard.writeText` was being called bare. It says nothing on
 * success, so a button that does not change when pressed is one nobody
 * trusts — the honest response is to press it again and then paste somewhere
 * to check, on a page whose whole job is getting a payment link to a client.
 *
 * And the Clipboard API only exists in a secure context, so on plain http —
 * a LAN address, a preview host without TLS, an older webview —
 * `navigator.clipboard` is undefined and `undefined.writeText(...)` throws
 * inside an onClick with no catch above it. The failure landed in a console
 * nobody had open while the button looked exactly as it does on success.
 */

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true });
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else setClipboard(undefined);
  vi.restoreAllMocks();
});

describe('copying a payment link', () => {
  it('says it copied, rather than looking identical to doing nothing', async () => {
    const writeText = vi.fn(async () => {});
    setClipboard({ writeText });

    render(<CopyButton value="https://pay.test/abc" label="Copy pay link" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy pay link' }));

    expect(writeText).toHaveBeenCalledWith('https://pay.test/abc');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  /*
   * The state that could not previously exist. Somebody who cannot copy has
   * to select the link by hand instead, and needs to know that BEFORE they
   * paste an empty clipboard into an email to a client.
   */
  it('says so when the browser will not let it copy', async () => {
    setClipboard(undefined);
    // jsdom does not implement execCommand at all — which is exactly the
    // shape of the environment this state exists for, so it is left absent
    // rather than stubbed. The helper's own try/catch is what turns the
    // resulting TypeError into an answer instead of a crash.

    render(<CopyButton value="https://pay.test/abc" label="Copy pay link" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy pay link' }));

    const failed = await screen.findByRole('button', { name: "Couldn't copy" });
    expect(failed.getAttribute('title')).toContain('by hand');
  });

  /*
   * A browser can expose the API and then refuse to use it — permission
   * denied, or a focus rule. Falling through to the old execCommand path is
   * the whole point of having one; giving up at the first rejection would
   * make the modern API strictly worse than the deprecated one.
   */
  it('falls back rather than giving up when the clipboard refuses', async () => {
    setClipboard({ writeText: vi.fn(async () => { throw new Error('Permission denied'); }) });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true, writable: true });

    render(<CopyButton value="https://pay.test/abc" label="Copy pay link" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy pay link' }));

    expect(exec).toHaveBeenCalledWith('copy');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('goes back to itself so the row does not stay green forever', async () => {
    setClipboard({ writeText: vi.fn(async () => {}) });

    render(<CopyButton value="https://pay.test/abc" label="Copy pay link" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy pay link' }));
    await screen.findByRole('button', { name: 'Copied' });

    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Copy pay link' })).toBeTruthy(),
      { timeout: 4000 }
    );
  });
});
