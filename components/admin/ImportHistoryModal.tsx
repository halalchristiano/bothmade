'use client';

import { useEffect, useState } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';

interface ImportLog {
  id: string;
  fileName: string | null;
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  createdAt: string;
  importedBy: { name: string | null; email: string } | null;
}

/** A permanent receipt trail of every CSV import — who ran it, what file, how many rows landed vs. skipped. */
export function ImportHistoryModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<ImportLog[] | null>(null);

  useEffect(() => {
    fetch('/api/admin/leads/import/history')
      .then((r) => r.json())
      .then((data) => setLogs(data.logs || []));
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#0a0812] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start p-6 pb-4 shrink-0">
          <div>
            <h2 className="text-lg font-bold">CSV import history</h2>
            <p className="text-xs text-white/40 mt-0.5">Every import ever run — a receipt trail, not just a memory.</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {logs === null ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-white/40" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-12">No CSV imports yet.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} className="text-sky-300 shrink-0" />
                      <span className="text-sm font-medium truncate">{log.fileName || 'Pasted CSV text'}</span>
                    </div>
                    <span className="text-xs text-white/40 shrink-0">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-white/50 mt-1.5">
                    <span className="text-emerald-300 font-medium">{log.importedCount} imported</span>
                    {log.skippedCount > 0 && (
                      <span className="text-amber-300"> · {log.skippedCount} skipped</span>
                    )}
                    {' · '}
                    {log.rowCount} row{log.rowCount === 1 ? '' : 's'} total
                    {' · by '}
                    {log.importedBy?.name || log.importedBy?.email || 'Unknown'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
