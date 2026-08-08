// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '@/lib/copy-to-clipboard';

/**
 * The copy helper, which had no tests, and the fallback nobody watches.
 *
 * The modern path is one line and works. The interesting half is the other
 * one: `navigator.clipboard` exists only in a secure context, so on a LAN
 * address, a preview host without TLS or an older embedded webview the whole
 * thing runs through a hidden textarea and `document.execCommand`.
 *
 * That path appended a textarea to the document and removed it *after*
 * `execCommand` returned — inside the same try. `execCommand('copy')` throws
 * in browsers that refuse a clipboard write outside a user gesture, so every
 * failed copy left an off-screen textarea in the document permanently. On the
 * one button this module was written for: the one that looks like it did
 * nothing, so the honest response is to press it again, and again.
 */

const textareas = () => document.querySelectorAll('textarea');

let execCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.innerHTML = '';
  execCommand = vi.fn(() => true);
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true, writable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** No Clipboard API at all — plain http, which is the whole reason for the fallback. */
const withoutClipboardApi = () => {
  vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: undefined });
};

describe('the modern path', () => {
  it('writes through the Clipboard API and says so', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: { writeText } });

    expect(await copyToClipboard('https://bothmade.studio/pay/abc')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://bothmade.studio/pay/abc');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('falls through to the old one when permission is refused', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('NotAllowedError');
    });
    vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: { writeText } });

    expect(await copyToClipboard('pay link')).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});

describe('the fallback, on a page with no Clipboard API', () => {
  it('copies, and reports honestly when the browser says no', async () => {
    withoutClipboardApi();

    expect(await copyToClipboard('pay link')).toBe(true);

    execCommand.mockReturnValue(false);
    expect(await copyToClipboard('pay link')).toBe(false);
  });

  it('leaves nothing behind when it works', async () => {
    withoutClipboardApi();

    await copyToClipboard('pay link');

    expect(textareas()).toHaveLength(0);
  });

  it('leaves nothing behind when execCommand refuses', async () => {
    withoutClipboardApi();
    execCommand.mockReturnValue(false);

    await copyToClipboard('pay link');

    expect(textareas()).toHaveLength(0);
  });

  it('leaves nothing behind when execCommand throws, which is the one that leaked', async () => {
    withoutClipboardApi();
    execCommand.mockImplementation(() => {
      throw new Error('document.execCommand is not allowed outside a user gesture');
    });

    expect(await copyToClipboard('pay link')).toBe(false);
    expect(textareas()).toHaveLength(0);
  });

  it('does not accumulate a textarea per press', async () => {
    // The realistic shape of this: a button that appears to do nothing, so
    // somebody presses it five more times.
    withoutClipboardApi();
    execCommand.mockImplementation(() => {
      throw new Error('blocked');
    });

    for (let i = 0; i < 6; i++) await copyToClipboard('pay link');

    expect(textareas()).toHaveLength(0);
  });

  it('gives the browser the whole string to copy, not an empty selection', async () => {
    withoutClipboardApi();
    let selected = '';
    execCommand.mockImplementation(() => {
      const area = document.querySelector('textarea') as HTMLTextAreaElement;
      selected = area.value.slice(area.selectionStart ?? 0, area.selectionEnd ?? 0);
      return true;
    });

    await copyToClipboard('https://bothmade.studio/pay/abc');

    expect(selected).toBe('https://bothmade.studio/pay/abc');
  });
});

describe('what it refuses to do', () => {
  it('does nothing with an empty string', async () => {
    withoutClipboardApi();

    expect(await copyToClipboard('')).toBe(false);
    expect(execCommand).not.toHaveBeenCalled();
    expect(textareas()).toHaveLength(0);
  });
});
