import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Attaching a mockup is the moment a deal stops waiting on design, so it
 * carries more than an insert: the lead's cached "latest mockup" moves, the
 * urgent request in team chat gets resolved, and the team is told. These
 * tests pin that sequence — and the two ways it used to go wrong: a second
 * version overwriting the first, and one paste landing twice.
 */

const mockupFindMany = vi.fn();
const mockupCreate = vi.fn();
const leadUpdate = vi.fn();
const teamMessageUpdateMany = vi.fn();
const teamMessageCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    leadMockup: {
      findMany: (...args: unknown[]) => mockupFindMany(...args),
      create: (...args: unknown[]) => mockupCreate(...args),
    },
    lead: { update: (...args: unknown[]) => leadUpdate(...args) },
    teamMessage: {
      updateMany: (...args: unknown[]) => teamMessageUpdateMany(...args),
      create: (...args: unknown[]) => teamMessageCreate(...args),
    },
  },
}));

const { normalizeMockupUrl, recordLeadMockup } = await import('@/lib/mockups');

const CREATED_AT = new Date('2026-08-02T14:14:00.000Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mk_1',
    url: 'https://figma.test/v1',
    fileName: null,
    note: '',
    createdAt: CREATED_AT,
    uploadedBy: { name: 'Kiana' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockupFindMany.mockResolvedValue([]);
  mockupCreate.mockResolvedValue(row());
  leadUpdate.mockResolvedValue({ id: 'lead_1', company: 'Duran Roofing' });
  teamMessageUpdateMany.mockResolvedValue({ count: 1 });
  teamMessageCreate.mockResolvedValue({ id: 'msg_1' });
});

describe('what counts as a mockup link', () => {
  it('takes an ordinary web link', () => {
    expect(normalizeMockupUrl('https://figma.test/v1')).toBe('https://figma.test/v1');
    expect(normalizeMockupUrl('  http://staging.test/v1  ')).toBe('http://staging.test/v1');
  });

  it('rescues a bare address-bar paste', () => {
    expect(normalizeMockupUrl('www.figma.test/v1')).toBe('https://www.figma.test/v1');
  });

  it('refuses anything that would render as a dead or hostile button', () => {
    expect(normalizeMockupUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeMockupUrl('ask kiana for it')).toBeNull();
    expect(normalizeMockupUrl('   ')).toBeNull();
    expect(normalizeMockupUrl(undefined)).toBeNull();
    expect(normalizeMockupUrl(42)).toBeNull();
  });
});

describe('attaching the first mockup', () => {
  it('numbers it one, caches it on the lead, and clears the urgent request', async () => {
    const result = await recordLeadMockup({
      leadId: 'lead_1',
      url: 'https://figma.test/v1',
      userId: 'user_evan',
    });

    expect(result.index).toBe(1);
    expect(result.alreadyAttached).toBe(false);
    expect(leadUpdate).toHaveBeenCalledWith({
      where: { id: 'lead_1' },
      data: { mockupUrl: 'https://figma.test/v1', mockupDeliveredAt: CREATED_AT },
    });
    expect(teamMessageUpdateMany).toHaveBeenCalledWith({
      where: { relatedLeadId: 'lead_1', urgent: true, resolved: false },
      data: { resolved: true },
    });
    expect(teamMessageCreate.mock.calls[0]![0].data.content).toBe(
      '✅ Mockup ready for Duran Roofing: https://figma.test/v1'
    );
  });

  it('hands back the version with who uploaded it and when', async () => {
    const { mockup } = await recordLeadMockup({
      leadId: 'lead_1',
      url: 'https://figma.test/v1',
      userId: 'user_evan',
    });

    expect(mockup).toEqual({
      id: 'mk_1',
      url: 'https://figma.test/v1',
      fileName: null,
      note: '',
      uploadedAt: CREATED_AT.toISOString(),
      uploadedByName: 'Kiana',
    });
  });
});

describe('attaching a later version', () => {
  beforeEach(() => {
    mockupFindMany.mockResolvedValue([row()]);
    mockupCreate.mockResolvedValue(row({ id: 'mk_2', url: 'https://figma.test/v2' }));
  });

  it('keeps the first one and numbers this one two', async () => {
    const result = await recordLeadMockup({
      leadId: 'lead_1',
      url: 'https://figma.test/v2',
      userId: 'user_evan',
    });

    expect(result.index).toBe(2);
    expect(mockupCreate).toHaveBeenCalledOnce();
    expect(teamMessageCreate.mock.calls[0]![0].data.content).toBe(
      '✅ Mockup 2 added for Duran Roofing: https://figma.test/v2'
    );
  });

  it('moves the lead’s cached link to the newest version', async () => {
    await recordLeadMockup({ leadId: 'lead_1', url: 'https://figma.test/v2', userId: 'user_evan' });

    expect(leadUpdate.mock.calls[0]![0].data.mockupUrl).toBe('https://figma.test/v2');
  });

  it('does not re-resolve an urgent request that version one already answered', async () => {
    await recordLeadMockup({ leadId: 'lead_1', url: 'https://figma.test/v2', userId: 'user_evan' });

    expect(teamMessageUpdateMany).not.toHaveBeenCalled();
  });
});

describe('the same link arriving twice', () => {
  it('returns the version it already is instead of duplicating it', async () => {
    mockupFindMany.mockResolvedValue([row(), row({ id: 'mk_2', url: 'https://figma.test/v2' })]);

    const result = await recordLeadMockup({
      leadId: 'lead_1',
      url: 'https://figma.test/v2',
      userId: 'user_evan',
    });

    expect(result.alreadyAttached).toBe(true);
    expect(result.index).toBe(2);
    expect(result.mockup.id).toBe('mk_2');
    expect(mockupCreate).not.toHaveBeenCalled();
    expect(teamMessageCreate).not.toHaveBeenCalled();
    // Re-posting the same link must not re-date the delivery either.
    expect(leadUpdate).not.toHaveBeenCalled();
  });
});
