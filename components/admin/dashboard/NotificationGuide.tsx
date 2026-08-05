'use client';

import { useState } from 'react';
import { Bell, ChevronRight, Mail, LayoutDashboard, MonitorSmartphone } from 'lucide-react';
import { NOTIFICATION_GUIDE, NOT_WATCHED, type NotifyWhere } from '@/lib/notification-guide';

/**
 * "What will this tell me, and when?"
 *
 * Enough now happens on its own — payment gates, the review clock, the chase
 * schedule, the call flag, three digests — that not knowing the list is a
 * real problem rather than a documentation nicety. If you do not know what is
 * being watched, silence is ambiguous: nothing happened, or nothing is
 * watching? Somebody who does not trust the quiet ends up checking everything
 * by hand, which is the exact work all of it was built to remove.
 *
 * Collapsed by default and remembered, because this is a thing you read twice
 * and then rely on. It sits beside the full breakdown rather than in Settings
 * for the same reason: the question occurs to you while you are looking at
 * the dashboard wondering why it is quiet.
 */

const WHERE_ICON: Record<NotifyWhere, typeof Bell> = {
  dashboard: LayoutDashboard,
  email: Mail,
  bell: Bell,
  screen: MonitorSmartphone,
};

const WHERE_LABEL: Record<NotifyWhere, string> = {
  dashboard: 'Dashboard',
  email: 'Email',
  bell: 'Bell',
  screen: 'On screen',
};

const STORAGE_KEY = 'bothmade_notification_guide_open';

export function NotificationGuide() {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* private browsing — closed is a fine default */
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
      >
        <ChevronRight
          size={16}
          className={`shrink-0 text-white/30 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="min-w-0">
          <span className="block text-sm font-bold">What we&apos;ll tell you, and when</span>
          <span className="block text-xs text-white/40">
            Every automatic notification — what sets it off, where it lands, and what time it runs.
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-6 border-t border-white/[0.06] px-5 py-5">
          {NOTIFICATION_GUIDE.map((group) => (
            <section key={group.title}>
              <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.15em] text-white/30">
                {group.title}
              </p>
              <div className="space-y-2">
                {group.rules.map((rule) => (
                  <div
                    key={rule.trigger}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-medium text-white/85">{rule.trigger}</p>
                      <div className="flex shrink-0 gap-1">
                        {rule.where.map((w) => {
                          const Icon = WHERE_ICON[w];
                          return (
                            <span
                              key={w}
                              title={WHERE_LABEL[w]}
                              className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-white/45"
                            >
                              <Icon size={10} />
                              {WHERE_LABEL[w]}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-white/55">{rule.tells}</p>
                    <p className="mt-1.5 text-[11px] text-white/30">
                      <span className="text-white/45">{rule.timing}</span>
                      {rule.basis && <span> · {rule.basis}</span>}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* An absence is invisible, and a reader who has just seen twenty
              rows of coverage will reasonably assume everything is covered. */}
          <section className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3.5">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-amber-200/70">
              What it does not watch
            </p>
            <ul className="space-y-1">
              {NOT_WATCHED.map((item) => (
                <li key={item} className="text-xs text-white/50">
                  · {item}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
