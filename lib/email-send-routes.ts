/**
 * Every route in the admin that can put a message in somebody's inbox.
 *
 * One list, for two jobs that have to agree. The browser reads it to know
 * which requests to hold back for confirmation; the preview endpoint reads it
 * to know how to render what that request would send. A route missing from
 * here sends without being seen — which is the failure this list exists to
 * make impossible — so it is written as patterns over paths rather than as
 * something each button opts into, and a new send route is caught by the
 * pattern whether or not anybody remembered this file.
 *
 * The rule is absolute on purpose. An email is not undoable. Everything that
 * has gone out wrong here — a follow-up signed by the wrong person, a draft
 * with "(add the two or three things you discussed)" still in it — was
 * readable, and would have been caught by anybody looking at it for two
 * seconds. There was simply nothing between the button and the send.
 */

/** What a send route is called, and what to say about it in the dialog. */
export interface SendRouteSpec {
  /**
   * Matched against the request path. A string matches a whole path; a RegExp
   * is tested against it, which is how the `[id]` segments are covered.
   */
  match: RegExp;
  /** Which HTTP methods on that path actually send. */
  methods?: string[];
  /**
   * For routes that only sometimes send, judged on the request body.
   *
   * Logging a phone call and emailing a lead go through one endpoint; so do
   * sending a change order and withdrawing one. Stopping to confirm the half
   * that sends nothing would put a dialog in front of logging a call — and a
   * dialog people meet twenty times a day for no reason is a dialog they stop
   * reading, which costs more than it saves.
   */
  when?: (body: Record<string, unknown>) => boolean;
  /** Named in the dialog: "Send the mockup to the client?" */
  action: string;
  /**
   * How to preview it, if it can be previewed from the request alone.
   *
   * Omitted where a message's content only exists part-way through the route
   * that sends it. Those still stop and ask — the dialog says plainly that it
   * could not render this one rather than pretending there is nothing to see.
   */
  preview?: string;
}

export const SEND_ROUTES: SendRouteSpec[] = [
  {
    match: /^\/api\/admin\/leads\/[^/]+\/send-mockup$/,
    action: 'Send the mockup folder to the client',
    preview: 'mockup',
  },
  {
    match: /^\/api\/admin\/leads\/[^/]+\/mockups\/[^/]+\/send$/,
    action: 'Send this mockup version to the client',
    preview: 'mockup',
  },
  {
    // Requesting a mockup emails whoever builds them, as the person asking.
    // The rest of what this endpoint does — saving a link, editing a field —
    // sends nothing, so only the request itself stops here.
    match: /^\/api\/admin\/leads\/[^/]+$/,
    methods: ['PATCH'],
    when: (body) => body.mockupRequested === true,
    action: 'Ask for a mockup, and email whoever builds them',
    preview: 'mockup-request',
  },
  {
    match: /^\/api\/admin\/leads\/[^/]+\/follow-up$/,
    action: 'Send the follow-up email',
    preview: 'follow-up',
  },
  {
    match: /^\/api\/admin\/leads\/[^/]+\/activity$/,
    // The same endpoint logs a call and sends an email. Only one of those is
    // a send, and it says so in the body.
    when: (body) => body.type === 'email' && Boolean(body.sendEmailNow),
    action: 'Send this email to the lead',
    preview: 'lead-activity',
  },
  {
    match: /^\/api\/admin\/leads\/[^/]+\/proposal$/,
    // Building the proposal and emailing it are one request with a flag.
    when: (body) => Boolean(body.sendEmail),
    action: 'Send the proposal to sign and pay',
  },
  {
    match: /^\/api\/admin\/leads\/[^/]+\/invoice$/,
    action: 'Email the invoice',
  },
  { match: /^\/api\/admin\/email\/send$/, action: 'Send this email', preview: 'templated' },
  { match: /^\/api\/admin\/email\/send-bulk$/, action: 'Send this email to everyone selected' },
  { match: /^\/api\/admin\/email\/send-cold-drafts$/, action: 'Send the cold outreach drafts' },
  { match: /^\/api\/admin\/broadcast$/, action: 'Send this to every client' },
  { match: /^\/api\/admin\/clients\/[^/]+\/broadcast$/, action: 'Send this to the client' },
  { match: /^\/api\/admin\/projects\/[^/]+\/message$/, action: 'Send this message to the client' },
  { match: /^\/api\/admin\/projects\/[^/]+\/status$/, action: 'Post the update, and email the client' },
  { match: /^\/api\/admin\/projects\/[^/]+\/instalments$/, action: 'Email the instalment to pay' },
  { match: /^\/api\/admin\/projects\/[^/]+\/payment-reminder$/, action: 'Send the payment reminder' },
  { match: /^\/api\/admin\/projects\/[^/]+\/design-review$/, action: 'Send the design to the client' },
  { match: /^\/api\/admin\/projects\/[^/]+\/recurring$/, action: 'Send the care plan offer' },
  { match: /^\/api\/admin\/projects\/create$/, action: 'Create it, and email the client their login' },
  {
    match: /^\/api\/admin\/recurring\/[^/]+$/,
    when: (body) => body.action === 'resend' || body.action === 'send',
    action: 'Send the care plan offer',
  },
  {
    // Withdrawing one goes to the same endpoint and mails nobody.
    match: /^\/api\/admin\/change-orders\/[^/]+$/,
    when: (body) => body.action === 'send',
    action: 'Send the change order to the client',
  },
  { match: /^\/api\/admin\/billing\/charges$/, action: 'Raise the charge, and email the client' },
  {
    match: /^\/api\/admin\/billing\/invoices\/[^/]+\/(void|refund)$/,
    action: 'Do it, and tell the client by email',
  },
];

/**
 * The spec covering a request, or null when nothing about it sends email.
 *
 * Pass `body` to get the final answer. Leave it out to ask the cheaper
 * question — "could this path ever send?" — which is what the browser asks
 * before it goes to the trouble of parsing a request body it will usually
 * find nothing in.
 *
 * Those two have to be asked in that order and both have to be answered
 * honestly: a path-only check that already applied `when` would say no to
 * every conditional route (there is no body to judge yet), and the guard
 * would wave through the one email that endpoint does send.
 */
export function sendRouteFor(
  path: string,
  method = 'POST',
  body?: Record<string, unknown>
): SendRouteSpec | null {
  const verb = method.toUpperCase();
  if (verb !== 'POST' && verb !== 'PATCH' && verb !== 'PUT') return null;
  // Query strings and origins are not part of what is matched.
  const pathname = path.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  const spec = SEND_ROUTES.find(
    (candidate) =>
      candidate.match.test(pathname) && (!candidate.methods || candidate.methods.includes(verb))
  );
  if (!spec) return null;
  // A body-conditional route that is not sending this time passes through as
  // though it were never on the list.
  if (body !== undefined && spec.when && !spec.when(body)) return null;
  return spec;
}
