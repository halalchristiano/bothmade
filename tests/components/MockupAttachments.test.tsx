import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MockupAttachments,
  formatUploadedAt,
  type LeadMockupItem,
} from '@/components/admin/MockupAttachments';

/**
 * A deal gets several mockups, and the rep is on a call when they need the
 * one from last Tuesday. What's asserted here is that every version stays
 * reachable with the time it landed, that the next one can be brought in
 * without displacing it, and that a note belongs to the version it was
 * written about.
 */

const uploadMock = vi.fn(async (..._args: unknown[]) => ({ url: 'https://blob.test/version-two.png' }));
vi.mock('@vercel/blob/client', () => ({ upload: (...args: unknown[]) => uploadMock(...args) }));

/** Exercised on its own in tests/lib/chunked-upload.test.ts. */
const uploadInPartsMock = vi.fn(async (..._args: unknown[]) => ({ url: 'https://blob.test/big.mov' }));
vi.mock('@/lib/chunked-upload', () => ({
  uploadFileInParts: (...args: unknown[]) => uploadInPartsMock(...args),
}));

/** A File of a given size without allocating one. */
function sizedFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function mockup(overrides: Partial<LeadMockupItem> = {}): LeadMockupItem {
  return {
    id: 'mk_1',
    url: 'https://figma.test/v1',
    fileName: null,
    note: '',
    uploadedAt: '2026-08-02T14:14:00.000Z',
    uploadedByName: 'Kiana',
    ...overrides,
  };
}

/** Routes by method so one mock covers attach (POST) and notes (PATCH). */
function mockFetch(responses: { post?: unknown; patch?: unknown; ok?: boolean }) {
  const fetchMock = vi.fn(async (_url: string, init?: { method?: string; body?: string }) => ({
    ok: responses.ok ?? true,
    json: async () => (init?.method === 'PATCH' ? responses.patch : responses.post),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  uploadMock.mockClear();
  uploadInPartsMock.mockClear();
});

describe('the versions already on the lead', () => {
  it('lists each one as its own button, in order', () => {
    render(
      <MockupAttachments
        leadId="lead_1"
        mockups={[mockup(), mockup({ id: 'mk_2', url: 'https://figma.test/v2' })]}
        onChanged={vi.fn()}
      />
    );

    expect(screen.getByRole('link', { name: /Mockup 1/ })).toHaveAttribute('href', 'https://figma.test/v1');
    expect(screen.getByRole('link', { name: /Mockup 2/ })).toHaveAttribute('href', 'https://figma.test/v2');
  });

  it('shows when it was uploaded, to the minute — two versions can land the same day', () => {
    render(<MockupAttachments leadId="lead_1" mockups={[mockup()]} onChanged={vi.fn()} />);

    expect(
      screen.getByText(`Uploaded ${formatUploadedAt('2026-08-02T14:14:00.000Z')} · Kiana`)
    ).toBeInTheDocument();
  });

  it('will not link a stored value that cannot be opened', () => {
    render(<MockupAttachments leadId="lead_1" mockups={[mockup({ url: 'ask kiana' })]} onChanged={vi.fn()} />);

    expect(screen.queryByRole('link', { name: /Mockup 1/ })).not.toBeInTheDocument();
    expect(screen.getByText(/link can't be opened/i)).toBeInTheDocument();
  });
});

describe('bringing in the next version', () => {
  it('offers the first attachment when the lead has none', () => {
    render(<MockupAttachments leadId="lead_1" mockups={[]} onChanged={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Attach mockup 1/ })).toBeInTheDocument();
  });

  it('numbers the next import after what is already there', () => {
    render(
      <MockupAttachments
        leadId="lead_1"
        mockups={[mockup(), mockup({ id: 'mk_2' })]}
        onChanged={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Import mockup 3/ })).toBeInTheDocument();
  });

  it('posts a pasted link and adds it to the list rather than replacing version one', async () => {
    const user = userEvent.setup();
    const attached = mockup({ id: 'mk_2', url: 'https://figma.test/v2' });
    const fetchMock = mockFetch({ post: { success: true, mockup: attached, index: 2 } });
    const onChanged = vi.fn();
    render(<MockupAttachments leadId="lead_1" mockups={[mockup()]} onChanged={onChanged} />);

    await user.click(screen.getByRole('button', { name: /Import mockup 2/ }));
    await user.type(screen.getByLabelText('Link for mockup 2'), 'https://figma.test/v2');
    await user.click(screen.getByRole('button', { name: 'Attach' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/leads/lead_1/mockups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://figma.test/v2' }),
    });
    expect(onChanged).toHaveBeenCalledWith([expect.objectContaining({ id: 'mk_1' }), attached]);
  });

  it('uploads a chosen file and attaches the stored copy under its own name', async () => {
    const user = userEvent.setup();
    const attached = mockup({ id: 'mk_2', url: 'https://blob.test/version-two.png', fileName: 'v2.png' });
    const fetchMock = mockFetch({ post: { success: true, mockup: attached, index: 2 } });
    render(<MockupAttachments leadId="lead_1" mockups={[mockup()]} onChanged={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Import mockup 2/ }));
    await user.upload(
      screen.getByLabelText(/upload the file/i),
      new File(['png'], 'v2.png', { type: 'image/png' })
    );

    expect(uploadMock).toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body!)).toEqual({
      url: 'https://blob.test/version-two.png',
      fileName: 'v2.png',
    });
  });

  it('uploads a video walkthrough — the type Blob is told is the one that gets it through', async () => {
    const user = userEvent.setup();
    const attached = mockup({ id: 'mk_2', url: 'https://blob.test/walkthrough.mov', fileName: 'walkthrough.MOV' });
    mockFetch({ post: { success: true, mockup: attached, index: 2 } });
    render(<MockupAttachments leadId="lead_1" mockups={[mockup()]} onChanged={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Import mockup 2/ }));
    // A clip shared out of the iOS Photos app often arrives with no type at all.
    await user.upload(
      screen.getByLabelText(/upload the file/i),
      new File(['mov'], 'walkthrough.MOV', { type: '' })
    );

    expect(uploadMock).toHaveBeenCalledWith(
      'walkthrough.MOV',
      expect.anything(),
      expect.objectContaining({ contentType: 'video/quicktime' })
    );
  });

  it('refuses an oversized file up front instead of after the upload', async () => {
    const user = userEvent.setup();
    mockFetch({ post: {} });
    render(<MockupAttachments leadId="lead_1" mockups={[]} onChanged={vi.fn()} />);

    const huge = new File(['x'], 'four-k.mp4', { type: 'video/mp4' });
    Object.defineProperty(huge, 'size', { value: 900 * 1024 * 1024 });

    await user.click(screen.getByRole('button', { name: /Attach mockup 1/ }));
    await user.upload(screen.getByLabelText(/upload the file/i), huge);

    expect(await screen.findByRole('alert')).toHaveTextContent(/900 MB.*limit is 512 MB/i);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('shows bytes as well as a percentage — "0%" alone reads the same as stuck', async () => {
    const user = userEvent.setup();
    mockFetch({ post: { success: true, mockup: mockup(), index: 1 } });
    // Hold the upload open at 12MB of 20MB so the progress line can be read.
    uploadMock.mockImplementationOnce(async (..._args: unknown[]) => {
      const options = _args[2] as { onUploadProgress?: (e: { loaded: number }) => void };
      options.onUploadProgress?.({ loaded: 12 * 1024 * 1024 });
      await new Promise(() => {}); // never settles
      return { url: '' };
    });
    render(<MockupAttachments leadId="lead_1" mockups={[]} onChanged={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Attach mockup 1/ }));
    await user.upload(
      screen.getByLabelText(/upload the file/i),
      sizedFile('walkthrough.mp4', 'video/mp4', 20 * 1024 * 1024)
    );

    expect(await screen.findByRole('status')).toHaveTextContent('12 MB of 20 MB (60%)');
  });

  it('sends a phone-sized recording through the chunked uploader, not one long request', async () => {
    const user = userEvent.setup();
    mockFetch({ post: { success: true, mockup: mockup(), index: 1 } });
    render(<MockupAttachments leadId="lead_1" mockups={[]} onChanged={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Attach mockup 1/ }));
    await user.upload(
      screen.getByLabelText(/upload the file/i),
      sizedFile('screen-recording.mov', 'video/quicktime', 334 * 1024 * 1024)
    );

    expect(uploadInPartsMock).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'video/quicktime' })
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('stops the upload when cancelled, rather than closing the panel over a live one', async () => {
    const user = userEvent.setup();
    mockFetch({ post: { success: true, mockup: mockup(), index: 1 } });
    let signal: AbortSignal | undefined;
    uploadMock.mockImplementationOnce(async (..._args: unknown[]) => {
      signal = (_args[2] as { abortSignal?: AbortSignal }).abortSignal;
      await new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
      return { url: '' };
    });
    render(<MockupAttachments leadId="lead_1" mockups={[]} onChanged={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Attach mockup 1/ }));
    await user.upload(
      screen.getByLabelText(/upload the file/i),
      sizedFile('walkthrough.mp4', 'video/mp4', 20 * 1024 * 1024)
    );
    await user.click(await screen.findByRole('button', { name: 'Cancel upload' }));

    expect(signal?.aborted).toBe(true);
    // A cancellation is not a failure, so it gets no red line.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks a stored video as one, so nobody opens a recording expecting a still', () => {
    render(
      <MockupAttachments
        leadId="lead_1"
        mockups={[mockup({ url: 'https://blob.test/walkthrough.mp4', fileName: 'walkthrough.mp4' })]}
        onChanged={vi.fn()}
      />
    );

    expect(screen.getByRole('link', { name: /Mockup 1 \(video\)/ })).toBeInTheDocument();
  });

  it('says what went wrong instead of quietly dropping the link', async () => {
    const user = userEvent.setup();
    mockFetch({ ok: false, post: { error: "That doesn't look like a link — it needs to start with https://" } });
    const onChanged = vi.fn();
    render(<MockupAttachments leadId="lead_1" mockups={[]} onChanged={onChanged} />);

    await user.click(screen.getByRole('button', { name: /Attach mockup 1/ }));
    await user.type(screen.getByLabelText('Link for mockup 1'), 'figma');
    await user.click(screen.getByRole('button', { name: 'Attach' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/needs to start with https/i);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('refuses to attach the same link twice, naming the version it already is', async () => {
    const user = userEvent.setup();
    mockFetch({ post: { success: true, mockup: mockup(), index: 1, alreadyAttached: true } });
    const onChanged = vi.fn();
    render(<MockupAttachments leadId="lead_1" mockups={[mockup()]} onChanged={onChanged} />);

    await user.click(screen.getByRole('button', { name: /Import mockup 2/ }));
    await user.type(screen.getByLabelText('Link for mockup 2'), 'https://figma.test/v1');
    await user.click(screen.getByRole('button', { name: 'Attach' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already attached as mockup 1/i);
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('notes, kept against the version they are about', () => {
  it('shows an existing note without needing a click', () => {
    render(
      <MockupAttachments
        leadId="lead_1"
        mockups={[mockup({ note: 'They want the menu on the homepage.' })]}
        onChanged={vi.fn()}
      />
    );

    expect(screen.getByText('They want the menu on the homepage.')).toBeInTheDocument();
  });

  it('saves what was typed against that mockup alone', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({ patch: { success: true, mockup: mockup({ id: 'mk_2' }) } });
    const onChanged = vi.fn();
    render(
      <MockupAttachments
        leadId="lead_1"
        mockups={[mockup(), mockup({ id: 'mk_2', url: 'https://figma.test/v2' })]}
        onChanged={onChanged}
      />
    );

    await user.click(screen.getByRole('button', { name: /notes to mockup 2/i }));
    await user.type(screen.getByLabelText('Notes on mockup 2'), 'Shown Tuesday, wants a booking form.');
    await user.click(screen.getByRole('button', { name: 'Save notes' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/leads/lead_1/mockups/mk_2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Shown Tuesday, wants a booking form.' }),
    });
    expect(onChanged).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'mk_1', note: '' }),
      expect.objectContaining({ id: 'mk_2', note: 'Shown Tuesday, wants a booking form.' }),
    ]);
  });

  it('keeps the note on screen and says so when the save fails', async () => {
    const user = userEvent.setup();
    mockFetch({ ok: false, patch: {} });
    const onChanged = vi.fn();
    render(<MockupAttachments leadId="lead_1" mockups={[mockup()]} onChanged={onChanged} />);

    await user.click(screen.getByRole('button', { name: /notes to mockup 1/i }));
    const field = screen.getByLabelText('Notes on mockup 1');
    await user.type(field, 'Hated the hero image.');
    await user.click(screen.getByRole('button', { name: 'Save notes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save that note/i);
    expect(field).toHaveValue('Hated the hero image.');
    expect(onChanged).not.toHaveBeenCalled();
  });
});
