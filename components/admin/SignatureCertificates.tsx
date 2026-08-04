'use client';

// The "prove they signed it" surface.
//
// The moment you need one of these, somebody is already disputing something
// and you are answering under time pressure — a chargeback window, a
// solicitor's letter, an insurer's form. So the certificate is generated on
// demand from one place, for any client, rather than assembled by hand out
// of the lead page each time.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, FileCheck2, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardHeader, EmptyState, SearchFilter, matchesSearch } from '@/components/admin/ui';

export interface SignatureRecord {
  clientId: string;
  projectId: string;
  company: string;
  projectName: string;
  signerName: string | null;
  signedAt: string | null;
  paidLabel?: string;
  archived?: boolean;
  hasExecutedCopy?: boolean;
}

/**
 * Pulls the PDF through fetch rather than pointing an <a download> at the
 * route, so a refusal arrives as the message the server wrote instead of a
 * tab full of JSON.
 */
export function GenerateCertificateButton({
  clientId,
  projectId,
  company,
  compact = false,
}: {
  clientId: string;
  projectId: string;
  company: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/clients/${clientId}/signature-certificate?projectId=${encodeURIComponent(projectId)}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Could not generate the certificate.');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${company.replace(/[^a-z0-9]/gi, '-')}-signature-certificate.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Something went wrong generating the certificate.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? 'text-right' : ''}>
      <button
        onClick={generate}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-xs font-semibold hover:bg-white/5 disabled:opacity-40 transition-colors whitespace-nowrap"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <FileCheck2 size={13} />}
        {busy ? 'Generating…' : 'Certificate'}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function RecordRow({ record }: { record: SignatureRecord }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link href={`/admin/clients/${record.clientId}`} className="text-sm font-medium truncate hover:underline">
            {record.company}
          </Link>
          {record.archived && <span className="text-[10px] uppercase tracking-wide text-white/30">decommissioned</span>}
          {record.hasExecutedCopy === false && (
            <span
              title="Signed before the executed-copy PDF was being saved — the certificate will say so."
              className="inline-flex items-center gap-1 text-[10px] text-amber-300/80"
            >
              <AlertTriangle size={11} />
              no document
            </span>
          )}
        </div>
        <p className="text-xs text-white/40 truncate">
          {record.signerName ? `Signed by ${record.signerName}` : 'Signer name not captured'}
          {record.signedAt ? ` · ${new Date(record.signedAt).toLocaleDateString()}` : ''}
          {record.paidLabel ? ` · ${record.paidLabel} paid` : ''}
        </p>
      </div>
      <GenerateCertificateButton
        clientId={record.clientId}
        projectId={record.projectId}
        company={record.company}
        compact
      />
    </div>
  );
}

/** The dashboard card: every certifiable signature, searchable, one click each. */
export function SignatureCertificatesCard() {
  const [records, setRecords] = useState<SignatureRecord[] | null>(null);
  const [query, setQuery] = useState('');
  // A sales account can reach the ops dashboard, and client money isn't
  // theirs to see. Withhold the whole card rather than showing an empty one
  // that reads as "there are no signed clients".
  const [permitted, setPermitted] = useState(true);

  useEffect(() => {
    fetch('/api/admin/signature-records')
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          setPermitted(false);
          return;
        }
        setRecords(r.ok ? (await r.json()).records ?? [] : []);
      })
      .catch(() => setRecords([]));
  }, []);

  if (!permitted) return null;

  const matched = (records ?? []).filter((r) => matchesSearch(query, r.company, r.signerName, r.projectName));

  return (
    <Card className="p-6">
      <CardHeader
        icon={ShieldCheck}
        tone="emerald"
        title="Signature Certificates"
        subtitle="Proof of signature for every paid client — who signed, when, from where, and what they agreed to"
      />

      {records === null ? (
        <p className="py-4 text-center text-sm text-white/30">Loading…</p>
      ) : records.length === 0 ? (
        <EmptyState icon={ShieldCheck} text="No signed and paid agreements yet." />
      ) : (
        <>
          <SearchFilter
            value={query}
            onChange={setQuery}
            placeholder="Search by company, signer or project..."
            count={matched.length}
            total={records.length}
          />
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {matched.map((record) => (
              <RecordRow key={record.projectId} record={record} />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
