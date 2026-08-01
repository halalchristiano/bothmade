'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_ACTIVITY_TYPES,
  LEAD_ACTIVITY_LABELS,
  PAIN_POINTS,
  type LeadStatus,
  type LeadActivityType,
  type PainPointKey,
} from '@/lib/leads';
import { formatCents } from '@/lib/pricing';

interface Activity {
  id: string;
  type: LeadActivityType;
  content: string;
  url: string | null;
  createdAt: string;
  createdBy: { name: string | null } | null;
}

interface LeadDetail {
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  source: string | null;
  estimatedValue: number | null;
  painPoints: string;
  notes: string | null;
  assignedTo: { name: string | null } | null;
  activities: Activity[];
}

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const leadId = params.leadId as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [notes, setNotes] = useState('');
  const [painPoints, setPainPoints] = useState<PainPointKey[]>([]);

  const [activityType, setActivityType] = useState<LeadActivityType>('note');
  const [activityContent, setActivityContent] = useState('');
  const [activityUrl, setActivityUrl] = useState('');
  const [sendEmailNow, setSendEmailNow] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [loggingActivity, setLoggingActivity] = useState(false);
  const [activityMessage, setActivityMessage] = useState('');

  const inputClass =
    'w-full px-4 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

  const load = async () => {
    try {
      const response = await fetch(`/api/admin/leads/${leadId}`);
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await response.json();
      if (data.success) {
        const l: LeadDetail = data.lead;
        setLead(l);
        setCompany(l.company);
        setContactName(l.contactName || '');
        setEmail(l.email || '');
        setPhone(l.phone || '');
        setSource(l.source || '');
        setEstimatedValue(l.estimatedValue ? String(l.estimatedValue / 100) : '');
        setNotes(l.notes || '');
        setPainPoints(
          l.painPoints
            .split(',')
            .filter(Boolean)
            .filter((p): p is PainPointKey => p in PAIN_POINTS)
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const togglePainPoint = (key: PainPointKey) => {
    setPainPoints((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          contactName,
          email,
          phone,
          source,
          estimatedValue: estimatedValue ? Math.round(Number(estimatedValue) * 100) : null,
          notes,
          painPoints,
        }),
      });
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: LeadStatus) => {
    await fetch(`/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const handleLogActivity = async () => {
    if (!activityContent.trim()) return;
    setLoggingActivity(true);
    setActivityMessage('');
    try {
      const response = await fetch(`/api/admin/leads/${leadId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activityType,
          content: activityContent,
          url: activityUrl || undefined,
          sendEmailNow: activityType === 'email' && sendEmailNow,
          emailSubject,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setActivityContent('');
        setActivityUrl('');
        setEmailSubject('');
        setActivityMessage(data.emailSent ? 'Logged and email sent.' : 'Logged.');
        load();
      } else {
        setActivityMessage(data.error || 'Failed to log activity');
      }
    } finally {
      setLoggingActivity(false);
    }
  };

  if (loading || !lead) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <Link href="/admin/leads" className="text-white/50 hover:text-white text-sm transition-colors">
        ← Back to Leads
      </Link>

      <div className="grid lg:grid-cols-3 gap-6 mt-4">
        {/* LEFT: Lead info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
            <div className="flex justify-between items-start mb-4">
              <h1 className="text-2xl font-bold">{lead.company}</h1>
              <button
                onClick={() => setEditing(!editing)}
                className="text-xs px-3 py-1 rounded-lg border border-white/15 hover:bg-white/5 transition-colors"
              >
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-white/40 mb-1">Status</label>
              <select
                value={lead.status}
                onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                className={inputClass}
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s} className="bg-[#05030a]">
                    {LEAD_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            {editing ? (
              <div className="space-y-3">
                <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className={inputClass} />
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" className={inputClass} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputClass} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={inputClass} />
                <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source" className={inputClass} />
                <input
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(e.target.value)}
                  placeholder="Estimated value (USD)"
                  type="number"
                  className={inputClass}
                />
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Quick notes..."
                  rows={3}
                  className={`${inputClass} resize-none`}
                />

                <div>
                  <p className="text-xs text-white/40 mb-2">What's wrong with their current setup?</p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {(Object.entries(PAIN_POINTS) as [PainPointKey, string][]).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={painPoints.includes(key)}
                          onChange={() => togglePainPoint(key)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-white/40 text-xs">Contact</p>
                  <p>{lead.contactName || '—'}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs">Email</p>
                  <p>{lead.email || '—'}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs">Phone</p>
                  <p>{lead.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs">Source</p>
                  <p>{lead.source || '—'}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs">Estimated Value</p>
                  <p>{lead.estimatedValue ? formatCents(lead.estimatedValue) : '—'}</p>
                </div>
                {lead.notes && (
                  <div>
                    <p className="text-white/40 text-xs">Notes</p>
                    <p className="text-white/70">{lead.notes}</p>
                  </div>
                )}
                {painPoints.length > 0 && (
                  <div>
                    <p className="text-white/40 text-xs mb-1">Identified issues</p>
                    <div className="flex flex-wrap gap-1.5">
                      {painPoints.map((p) => (
                        <span key={p} className="text-xs px-2 py-1 rounded-full bg-red-400/10 text-red-300">
                          {PAIN_POINTS[p]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Activity timeline + logger */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
            <h2 className="text-xl font-bold mb-4">Log Activity</h2>

            <div className="flex gap-2 mb-3">
              {LEAD_ACTIVITY_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setActivityType(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    activityType === t
                      ? 'bg-gradient-to-r from-sky-400 to-purple-500 text-black font-semibold'
                      : 'border border-white/15 text-white/60 hover:bg-white/5'
                  }`}
                >
                  {LEAD_ACTIVITY_LABELS[t]}
                </button>
              ))}
            </div>

            {activityType === 'email' && (
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject"
                className={`${inputClass} mb-3`}
              />
            )}

            <textarea
              value={activityContent}
              onChange={(e) => setActivityContent(e.target.value)}
              placeholder={
                activityType === 'email'
                  ? 'Email body...'
                  : activityType === 'loom'
                  ? 'What does this Loom cover?'
                  : activityType === 'call'
                  ? 'What was discussed on the call?'
                  : 'Note...'
              }
              rows={4}
              className={`${inputClass} resize-none mb-3`}
            />

            {(activityType === 'loom' || activityType === 'call') && (
              <input
                value={activityUrl}
                onChange={(e) => setActivityUrl(e.target.value)}
                placeholder={activityType === 'loom' ? 'Loom video URL' : 'Recording URL (optional)'}
                className={`${inputClass} mb-3`}
              />
            )}

            {activityType === 'email' && (
              <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
                <input type="checkbox" checked={sendEmailNow} onChange={(e) => setSendEmailNow(e.target.checked)} />
                Actually send this email to {lead.email || 'the lead'} now
              </label>
            )}

            {activityMessage && <p className="text-sm text-emerald-300 mb-3">{activityMessage}</p>}

            <button
              onClick={handleLogActivity}
              disabled={loggingActivity || !activityContent.trim()}
              className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {loggingActivity ? 'Saving...' : 'Log Activity'}
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
            <h2 className="text-xl font-bold mb-4">Timeline</h2>
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {lead.activities.length === 0 && (
                <p className="text-white/40 text-sm">No activity logged yet.</p>
              )}
              {lead.activities.map((activity) => (
                <div key={activity.id} className="p-4 rounded-lg bg-white/5 border-l-2 border-sky-400/50">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-sky-300">
                      {LEAD_ACTIVITY_LABELS[activity.type]}
                    </span>
                    <span className="text-xs text-white/30">
                      {new Date(activity.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-white/70 whitespace-pre-wrap">{activity.content}</p>
                  {activity.url && (
                    <a
                      href={activity.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-sky-300 hover:underline mt-1 inline-block"
                    >
                      {activity.url}
                    </a>
                  )}
                  <p className="text-xs text-white/30 mt-1">by {activity.createdBy?.name || 'Team'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
