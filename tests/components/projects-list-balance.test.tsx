import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminProjectsPage from '@/app/admin/projects/page';

/**
 * The money badge on the delivery list.
 *
 * `formatCents` returns a formatted currency string — symbol included — and
 * this one call site put a literal `$` in front of it, so every project
 * carrying a balance advertised "$$9,667 due" on the page the studio opens
 * to see what is owed. Invisible in a test that asserts on the number, which
 * is why this one asserts on the whole string.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const PROJECT = {
  id: 'p1',
  name: 'Northgate — Website',
  status: 'build',
  statusStage: 2,
  timeline: '8 weeks',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  totalPrice: 1_450_000,
  client: { company: 'Northgate Dental', email: 'dana@northgate.test' },
  messages: [],
  payments: [{ amount: 483_333, type: 'deposit' }],
  instalments: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, projects: [PROJECT] }) }) as unknown as Response)
  );
});

describe('a project with a balance outstanding', () => {
  /*
   * Asserted on the page's whole text rather than on a node. The badge splits
   * the amount and the word "due" across two text nodes, so a `getByText`
   * matches both the badge and its parent — and, more to the point, the bug
   * was a stray character next to the number, which a query for the number
   * would have stepped straight over.
   */
  it('shows the amount with one currency symbol, not two', async () => {
    const { container } = render(<AdminProjectsPage />);

    await screen.findAllByText(/9,667/);
    expect(container.textContent).toContain('$9,667 due');
    expect(container.textContent).not.toContain('$$');
  });
});
