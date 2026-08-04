import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PdfOrLinkField } from '@/components/admin/PdfOrLinkField';
import { upload } from '@vercel/blob/client';

/**
 * "Files & access" took a URL and nothing else, which quietly assumed the
 * PDF was already hosted somewhere. It isn't — it's on somebody's desktop.
 * So the field could only be filled by uploading the file elsewhere first
 * and pasting the link back, and the usual outcome was an empty field and a
 * PDF never attached to the lead at all.
 *
 * Either route has to end in the same place: a URL saved on the lead.
 */

vi.mock('@vercel/blob/client', () => ({ upload: vi.fn() }));

function Harness() {
  const [value, setValue] = useState('');
  return (
    <>
      <PdfOrLinkField
        value={value}
        onChange={setValue}
        leadId="lead_1"
        inputClass="field"
        label="Invoice PDF"
      />
      <output data-testid="stored">{value}</output>
    </>
  );
}

const stored = () => screen.getByTestId('stored').textContent;
const pdf = (name = 'invoice.pdf', type = 'application/pdf') =>
  new File(['%PDF-1.7'], name, { type });

beforeEach(() => {
  vi.mocked(upload).mockReset();
  vi.mocked(upload).mockResolvedValue({
    url: 'https://abc123.public.blob.vercel-storage.com/invoice-x9.pdf',
  } as Awaited<ReturnType<typeof upload>>);
});

describe('pasting a link', () => {
  it('stores it as typed', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText('Invoice PDF link'), 'https://drive.example/inv.pdf');

    expect(stored()).toBe('https://drive.example/inv.pdf');
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('uploading the file', () => {
  it('stores the URL the upload came back with', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.upload(screen.getByLabelText('Upload Invoice PDF'), pdf());

    await waitFor(() =>
      expect(stored()).toBe('https://abc123.public.blob.vercel-storage.com/invoice-x9.pdf')
    );
  });

  it('sends it to the lead-scoped token route', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.upload(screen.getByLabelText('Upload Invoice PDF'), pdf());

    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(vi.mocked(upload).mock.calls[0][2]).toMatchObject({
      handleUploadUrl: '/api/admin/leads/lead_1/documents/upload',
    });
  });

  it('confirms it landed, since a blob URL says nothing to a human', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.upload(screen.getByLabelText('Upload Invoice PDF'), pdf());

    expect(await screen.findByText(/PDF uploaded/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open it/i })).toHaveAttribute(
      'href',
      'https://abc123.public.blob.vercel-storage.com/invoice-x9.pdf'
    );
  });

  it('refuses a file that is not a PDF before spending the upload', async () => {
    // applyAccept: false bypasses the input's own accept="application/pdf",
    // which is what the file picker enforces. The point of this test is the
    // JS guard behind it — the path a renamed file or a drag-drop takes.
    const user = userEvent.setup({ applyAccept: false });
    render(<Harness />);

    await user.upload(
      screen.getByLabelText('Upload Invoice PDF'),
      pdf('screenshot.png', 'image/png')
    );

    expect(await screen.findByText(/needs to be a PDF/i)).toBeInTheDocument();
    // The token route enforces this too, but not starting a 25MB upload that
    // is going to be rejected is the kinder half.
    expect(upload).not.toHaveBeenCalled();
    expect(stored()).toBe('');
  });

  it('says what went wrong rather than failing silently', async () => {
    vi.mocked(upload).mockRejectedValue(new Error('Upload failed: file too large'));
    const user = userEvent.setup();
    render(<Harness />);

    await user.upload(screen.getByLabelText('Upload Invoice PDF'), pdf());

    expect(await screen.findByText(/file too large/i)).toBeInTheDocument();
    expect(stored()).toBe('');
  });
});
