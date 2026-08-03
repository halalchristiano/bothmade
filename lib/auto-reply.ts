/**
 * Headers and subject shapes that mean "a machine answered", not a person.
 *
 * An out-of-office is not a buying signal, but it looked exactly like one:
 * the lead was flagged "wrote back", jumped to the top of the call list,
 * and — worse — the reply cleared any bounce flag on the address, because a
 * reply is normally proof the address works. A holiday auto-reply from a
 * mailbox that later hard-bounces would therefore un-flag a dead address
 * and put it back into rotation.
 *
 * RFC 3834 gives us Auto-Submitted; Microsoft and Google both set
 * X-Auto-Response-Suppress or Precedence on generated mail. Subject
 * matching is the last resort for senders that set no headers at all.
 */
export const AUTO_REPLY_SUBJECT = /\b(out of (the )?office|auto[- ]?(reply|response)|automatic reply|away from (my )?(desk|email)|on (annual |parental |maternity |paternity )?leave|vacation (reply|response)|no longer (with|at) (the )?(company|us)|thank you for (your )?(email|message|enquiry|inquiry)[.!]?$|we have received your)/i;

export function isAutomatedReply(headers: Array<{ name?: string | null; value?: string | null }>): boolean {
  const get = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name)?.value?.toLowerCase() ?? '';

  // "auto-replied" / "auto-generated" — anything but "no" means a machine.
  const autoSubmitted = get('auto-submitted');
  if (autoSubmitted && autoSubmitted !== 'no') return true;

  if (get('x-autoreply') || get('x-autorespond') || get('x-auto-response-suppress')) return true;
  if (/^(auto_reply|bulk|junk|list)$/.test(get('precedence'))) return true;
  // Set by most mailing-list software; a list blast is not a reply either.
  if (get('list-id') || get('list-unsubscribe')) return true;

  return AUTO_REPLY_SUBJECT.test(get('subject'));
}
