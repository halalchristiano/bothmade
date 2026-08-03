import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddOnPicker, BaseServicePicker } from '@/components/admin/AddOnPicker';
import { ADD_ONS, ADD_ON_CATEGORIES, BASE_SERVICES } from '@/lib/pricing';

/**
 * The picker is where a quote is assembled. The bug the shared version
 * fixes: the manual project form listed every add-on flat and let someone
 * tick "Custom Backend" on a Web App, whose price already includes it —
 * charging the client twice for one thing.
 */

describe('BaseServicePicker', () => {
  it('offers every base service with its price', () => {
    render(<BaseServicePicker value="website" onChange={vi.fn()} />);

    for (const service of Object.values(BASE_SERVICES)) {
      expect(screen.getByRole('radio', { name: new RegExp(service.label) })).toBeInTheDocument();
    }
    expect(screen.getByRole('radio', { name: /Website/ })).toHaveTextContent('$3,000');
  });

  it('marks exactly one option as chosen', () => {
    render(<BaseServicePicker value="web-app" onChange={vi.fn()} />);

    const chosen = screen.getAllByRole('radio').filter((el) => el.getAttribute('aria-checked') === 'true');
    expect(chosen).toHaveLength(1);
    expect(chosen[0]).toHaveTextContent('Web App');
  });

  it('reports the picked service', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BaseServicePicker value="website" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /iOS App/ }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith('ios-app');
  });

  it('groups the options so a screen reader announces them as one choice', () => {
    render(<BaseServicePicker value="website" onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: 'Base service' })).toBeInTheDocument();
  });
});

describe('AddOnPicker', () => {
  it('lists every add-on in the catalogue, under its category', () => {
    render(<AddOnPicker baseService="website" selected={[]} onToggle={vi.fn()} />);

    for (const category of Object.values(ADD_ON_CATEGORIES)) {
      expect(screen.getByText(category.label)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('checkbox')).toHaveLength(Object.keys(ADD_ONS).length);
  });

  it('checks what is already selected', () => {
    render(<AddOnPicker baseService="website" selected={['seo']} onToggle={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: /SEO Setup/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Analytics/ })).not.toBeChecked();
  });

  it('reports a toggle by key', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<AddOnPicker baseService="website" selected={[]} onToggle={onToggle} />);

    await user.click(screen.getByRole('checkbox', { name: /SEO Setup/ }));

    expect(onToggle).toHaveBeenCalledExactlyOnceWith('seo');
  });

  it('locks an add-on the base price already covers, and says so', () => {
    render(<AddOnPicker baseService="web-app" selected={['custom-backend']} onToggle={vi.fn()} />);

    const backend = screen.getByRole('checkbox', { name: /Custom Backend/ });
    expect(backend).toBeDisabled();
    expect(backend.closest('label')).toHaveTextContent('Included');
  });

  it('shows the same add-on as a real, priced choice on a plain website', () => {
    render(<AddOnPicker baseService="website" selected={[]} onToggle={vi.fn()} />);

    const backend = screen.getByRole('checkbox', { name: /Custom Backend/ });
    expect(backend).toBeEnabled();
    expect(backend.closest('label')).toHaveTextContent('+$3,000');
    expect(backend.closest('label')).not.toHaveTextContent('Included');
  });

  it('cannot be toggled when it is bundled into the base price', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<AddOnPicker baseService="web-app" selected={['user-accounts']} onToggle={onToggle} />);

    await user.click(screen.getByRole('checkbox', { name: /User Accounts/ }));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('drops the descriptions and the grouping in the compact variant', () => {
    render(
      <AddOnPicker
        baseService="website"
        selected={[]}
        onToggle={vi.fn()}
        grouped={false}
        showDescriptions={false}
      />
    );

    expect(screen.queryByText(ADD_ON_CATEGORIES['content-growth'].label)).not.toBeInTheDocument();
    expect(screen.queryByText(ADD_ONS.seo.description)).not.toBeInTheDocument();
    // Every add-on is still offered — only the chrome is lighter.
    expect(screen.getAllByRole('checkbox')).toHaveLength(Object.keys(ADD_ONS).length);
  });

  it('prices every visible tile', () => {
    render(<AddOnPicker baseService="website" selected={[]} onToggle={vi.fn()} />);

    for (const box of screen.getAllByRole('checkbox')) {
      const label = box.closest('label')!;
      expect(within(label).getByText(/^\+\$|^Included$/)).toBeInTheDocument();
    }
  });
});
