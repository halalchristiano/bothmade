'use client';

import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';

/**
 * A document field that takes either a link or the file itself.
 *
 * It used to take a URL only, which quietly assumed the PDF was already
 * hosted somewhere. In practice it is sitting on somebody's desktop, so the
 * field could be filled only by uploading it elsewhere first and pasting the
 * link back — and the usual result is an empty field and a PDF that never
 * gets attached to the lead at all.
 *
 * Either route ends in the same place: a URL saved on the lead. Nothing
 * downstream needs to know which way it arrived.
 */
export function PdfOrLinkField({
  value,
  onChange,
  leadId,
  inputClass,
  placeholder = 'https://…',
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  leadId: string;
  inputClass: string;
  placeholder?: string;
  /** Used in the file picker's accessible name, e.g. "Invoice PDF". */
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Checked here as well as in the token route: the route is what actually
    // enforces it, but finding out before a 25MB upload starts is kinder
    // than finding out after.
    if (file.type !== 'application/pdf') {
      setError('That needs to be a PDF.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setBusy(true);
    setError('');
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: `/api/admin/leads/${leadId}/documents/upload`,
      });
      onChange(blob.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const uploaded = value.includes('.blob.vercel-storage.com');

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={`${label} link`}
          className={`${inputClass} flex-1 min-w-0`}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="shrink-0 rounded-xl border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white disabled:opacity-50 transition-colors"
        >
          {busy ? 'Uploading…' : 'Upload PDF'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          aria-label={`Upload ${label}`}
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {/* A blob URL is unreadable, so the field alone gives no sign the
          upload worked. Say so, and link it, so it can be checked. */}
      {uploaded && !busy && (
        <p className="mt-1 text-xs text-emerald-300/80">
          PDF uploaded —{' '}
          <a href={value} target="_blank" rel="noopener noreferrer" className="underline">
            open it
          </a>{' '}
          to check it, then Save.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}
