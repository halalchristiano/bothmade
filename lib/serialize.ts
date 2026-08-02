/**
 * Field whitelists for records that go over the wire.
 *
 * The rule here is narrow and absolute: never hand a Prisma row straight to
 * `NextResponse.json`. Prisma returns every column it has, including
 * `password` — a bcrypt hash of a password the client chose and probably
 * reused elsewhere. Shipping that to a browser puts it in the network tab,
 * in any logging proxy on the path, and in whatever the page's own client
 * state gets serialised into.
 *
 * Pick from these instead of hand-rolling a shape at each call site, so a
 * new column added to `Client` tomorrow can't silently join a response.
 */

/** Every non-secret field on a client. What their own portal may see. */
export type ClientSelfView = {
  id: string;
  email: string;
  company: string;
  contactName: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
};

/** What a team member sees about a client. Adds ops fields, still no secrets. */
export type ClientAdminView = ClientSelfView & {
  subscription: string | null;
  subscriptionTier: number;
  onboardingComplete: boolean;
  lastLoginAt: Date | null;
  archivedAt: Date | null;
  stripeCustomerId: string | null;
};

/** Minimal identity — for embedding a client inside another record. */
export type ClientRef = {
  id: string;
  email: string;
  company: string;
  contactName: string | null;
};

type AnyClient = {
  id: string;
  email: string;
  company: string;
  contactName: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
  subscription?: string | null;
  subscriptionTier?: number;
  onboardingComplete?: boolean;
  lastLoginAt?: Date | null;
  archivedAt?: Date | null;
  stripeCustomerId?: string | null;
};

export function toClientSelfView(client: AnyClient): ClientSelfView {
  return {
    id: client.id,
    email: client.email,
    company: client.company,
    contactName: client.contactName,
    phone: client.phone,
    mustChangePassword: client.mustChangePassword,
    createdAt: client.createdAt,
  };
}

export function toClientAdminView(client: AnyClient): ClientAdminView {
  return {
    ...toClientSelfView(client),
    subscription: client.subscription ?? null,
    subscriptionTier: client.subscriptionTier ?? 1,
    onboardingComplete: client.onboardingComplete ?? false,
    lastLoginAt: client.lastLoginAt ?? null,
    archivedAt: client.archivedAt ?? null,
    stripeCustomerId: client.stripeCustomerId ?? null,
  };
}

export function toClientRef(client: AnyClient): ClientRef {
  return {
    id: client.id,
    email: client.email,
    company: client.company,
    contactName: client.contactName,
  };
}

/**
 * A Prisma `select` for the same shape, for the cases where it's better to
 * never load the hash in the first place than to drop it on the way out.
 */
export const CLIENT_SELF_SELECT = {
  id: true,
  email: true,
  company: true,
  contactName: true,
  phone: true,
  mustChangePassword: true,
  createdAt: true,
} as const;
