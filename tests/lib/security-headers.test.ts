import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

/**
 * The response headers are the only security control in this codebase with no
 * visible failure mode.
 *
 * Everything else announces itself when it breaks: drop a `requireStaff()` and
 * a test 401s, break the rate limiter and the login route throws. Delete a line
 * from `securityHeaders` and the site keeps working perfectly — the pages
 * render, the tests pass, nothing 500s. It is simply no longer protected, and
 * the only way to find out is for someone to think to look. That is exactly the
 * shape of regression a test is for.
 *
 * So these assert on the properties that matter rather than on an exact string,
 * which would fail every time a legitimate directive is added.
 */

async function headersFor(path: string): Promise<Record<string, string>> {
  const rules = await nextConfig.headers!();
  const matching = rules.filter((rule) => new RegExp(`^${rule.source}$`).test(path));
  return Object.fromEntries(
    matching.flatMap((rule) => rule.headers.map((h) => [h.key, h.value] as const))
  );
}

/** Parses the CSP into directive -> sources, so tests read like the policy does. */
function cspDirectives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp.split(';').map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name, sources];
    })
  );
}

describe('security headers', () => {
  it('applies to every path, not just pages', async () => {
    // The matcher is `/(.*)`. An API route serving JSON needs `nosniff` as
    // much as a page does — arguably more.
    for (const path of ['/', '/admin/leads', '/api/clients', '/f/abc123']) {
      const headers = await headersFor(path);
      expect(Object.keys(headers).length, `no headers matched ${path}`).toBeGreaterThan(0);
    }
  });

  it('sends the full set', async () => {
    const headers = await headersFor('/');
    expect(Object.keys(headers)).toEqual(
      expect.arrayContaining([
        'Content-Security-Policy',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'Permissions-Policy',
        'Strict-Transport-Security',
      ])
    );
  });

  it('refuses to be framed, two ways', async () => {
    // Clickjacking: an invisible iframe of /admin over an attacker's page.
    // Both are set because `frame-ancestors` is CSP2 and X-Frame-Options is
    // what older browsers understand.
    const headers = await headersFor('/');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(cspDirectives(headers['Content-Security-Policy'])['frame-ancestors']).toEqual(["'none'"]);
  });

  it('never lets a browser guess a content type', async () => {
    const headers = await headersFor('/');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('does not leak full URLs to other origins', async () => {
    // A path can carry a share token. Referer must not hand it to whatever
    // third party a client clicks through to.
    const headers = await headersFor('/');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });
});

describe('HSTS', () => {
  it('covers subdomains, because that is where the sessions are', async () => {
    // The auth cookie is readable across bothmade.studio, and clients are
    // emailed links to <company>.bothmade.studio and enquiryform.bothmade.studio.
    // Protecting only the apex would leave those as the downgrade path.
    const value = (await headersFor('/'))['Strict-Transport-Security'];
    expect(value).toContain('includeSubDomains');
  });

  it('lasts long enough to be worth having', async () => {
    // Under a few months and a browser that has not visited recently is
    // unprotected again. The preload list requires at least one year.
    const value = (await headersFor('/'))['Strict-Transport-Security'];
    const maxAge = Number(/max-age=(\d+)/.exec(value)?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(31536000);
  });
});

describe('content security policy', () => {
  it('blocks the directives an injection would need', async () => {
    const directives = cspDirectives((await headersFor('/'))['Content-Security-Policy']);

    // No plugin content, no <base> rewriting every relative script URL, and
    // no form posting credentials to another origin.
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['base-uri']).toEqual(["'self'"]);
    expect(directives['form-action']).toEqual(["'self'"]);
  });

  it('has a default-src to fall back to', async () => {
    // Without this, any directive not named below is unrestricted.
    const directives = cspDirectives((await headersFor('/'))['Content-Security-Policy']);
    expect(directives['default-src']).toEqual(["'self'"]);
  });

  it('loads script only from us', async () => {
    // 'unsafe-inline' is accepted here and the reasoning is in next.config.ts:
    // Next streams its RSC payload through inline <script> tags. What must not
    // appear is a third-party origin, or a wildcard that permits one.
    const sources = cspDirectives((await headersFor('/'))['Content-Security-Policy'])['script-src'];
    expect(sources).toContain("'self'");
    expect(sources.some((s) => s.startsWith('http'))).toBe(false);
    expect(sources).not.toContain('*');
  });

  it('does not allow eval outside development', async () => {
    // NODE_ENV is 'test' here, which is the production branch of `isDev`.
    // 'unsafe-eval' turns a string into executable code and is the dev-only
    // React error overlay's requirement, not the shipped app's.
    const sources = cspDirectives((await headersFor('/'))['Content-Security-Policy'])['script-src'];
    expect(sources).not.toContain("'unsafe-eval'");
  });

  it('pins exfiltration destinations to us and Blob storage', async () => {
    // connect-src is what a stolen token would be sent out over.
    const sources = cspDirectives((await headersFor('/'))['Content-Security-Policy'])['connect-src'];
    expect(sources).toContain("'self'");
    for (const source of sources) {
      expect(
        source === "'self'" || source.includes('blob.vercel-storage.com'),
        `unexpected connect-src destination: ${source}`
      ).toBe(true);
    }
  });

  it('is enforcing, not report-only', async () => {
    // CSP_REPORT_ONLY is meant for a single deploy while watching the console.
    // Left set, the whole policy logs violations and blocks nothing.
    const headers = await headersFor('/');
    expect(headers['Content-Security-Policy-Report-Only']).toBeUndefined();
    expect(headers['Content-Security-Policy']).toBeDefined();
  });
});

describe('what the config does not advertise', () => {
  it('does not send X-Powered-By', async () => {
    // Free reconnaissance: it points a scanner straight at the framework's
    // CVE list instead of making it probe blind.
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('does not ship browser source maps', async () => {
    // With these on, the production bundle reconstructs into the original
    // TypeScript — identifiers, file structure and every comment in this repo.
    expect(nextConfig.productionBrowserSourceMaps).toBe(false);
  });
});
