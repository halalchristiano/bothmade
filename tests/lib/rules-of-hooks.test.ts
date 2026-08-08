import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/**
 * Hooks must not sit below an early return.
 *
 * THE BUG THIS EXISTS FOR. `useBodyScrollLock(mobileOpen)` was placed after
 * the admin layout's `if (pathname === '/admin/login') return`, so the login
 * route ran one fewer hook than every other admin route. Hook order belongs
 * to a component instance, not to a route — so the moment login redirected to
 * the dashboard, the same AdminLayout re-rendered with one more hook than its
 * previous render and React threw #310, "rendered more hooks than during the
 * previous render". On every login, which is how almost everybody enters this
 * app.
 *
 * What makes it worth a test rather than a fix and a promise: it shipped past
 * a green suite, a clean typecheck and a passing build, because none of those
 * render a production bundle in a browser and then follow a redirect.
 * Development recovers quietly where production throws. It was found by
 * driving the built app in Chromium and reading the console — which is not
 * something that happens on every commit.
 *
 * `eslint-plugin-react-hooks` is the usual home for this rule and is not
 * installed here; there is no ESLint at all. This is the same check, using
 * the TypeScript compiler that is already a dependency, so it costs nothing
 * to run and nothing to install.
 *
 * Deliberately narrow: only hooks at the top level of a component body, only
 * after a top-level return. Hooks inside callbacks, nested functions or
 * conditionals are somebody else's rule and would make this noisy enough to
 * be ignored, which is the one thing a guard like this cannot afford.
 */

const ROOTS = ['app', 'components'];

function tsxFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, found);
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) found.push(full);
  }
  return found;
}

const isHookName = (name: string) => /^use[A-Z]/.test(name);

/** A function that React will call as a component or a hook. */
function isReactish(name: string | undefined): boolean {
  if (!name) return false;
  return /^[A-Z]/.test(name) || isHookName(name);
}

interface Offence {
  file: string;
  fn: string;
  hook: string;
  line: number;
  returnLine: number;
}

/** Hook calls that appear, at the top level of `body`, after a top-level return. */
function offencesIn(file: string, fn: string, body: ts.Block, src: ts.SourceFile): Offence[] {
  const out: Offence[] = [];
  let returnedAt: number | null = null;

  for (const stmt of body.statements) {
    // A bare `return` directly in the body, or one inside a top-level `if`
    // with no else — the shape of every early return in this codebase.
    if (ts.isReturnStatement(stmt) || (ts.isIfStatement(stmt) && containsDirectReturn(stmt))) {
      if (returnedAt === null) {
        returnedAt = src.getLineAndCharacterOfPosition(stmt.getStart(src)).line + 1;
      }
      continue;
    }
    if (returnedAt === null) continue;

    // Past an early return: any hook call here runs conditionally.
    forEachTopLevelCall(stmt, (call) => {
      const name = ts.isIdentifier(call.expression) ? call.expression.text : undefined;
      if (name && isHookName(name)) {
        out.push({
          file,
          fn,
          hook: name,
          line: src.getLineAndCharacterOfPosition(call.getStart(src)).line + 1,
          returnLine: returnedAt as number,
        });
      }
    });
  }
  return out;
}

function containsDirectReturn(node: ts.IfStatement): boolean {
  const then = node.thenStatement;
  if (ts.isReturnStatement(then)) return true;
  if (ts.isBlock(then)) return then.statements.some((s) => ts.isReturnStatement(s));
  return false;
}

/** Walks a statement but does NOT descend into nested function bodies. */
function forEachTopLevelCall(node: ts.Node, visit: (call: ts.CallExpression) => void) {
  const walk = (n: ts.Node) => {
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n)
    ) {
      return; // a callback's hooks are not this component's hooks
    }
    if (ts.isCallExpression(n)) visit(n);
    ts.forEachChild(n, walk);
  };
  walk(node);
}

function scan(file: string): Offence[] {
  const text = readFileSync(file, 'utf8');
  if (!/use[A-Z]/.test(text)) return [];
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Offence[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.body && isReactish(node.name?.text)) {
      out.push(...offencesIn(file, node.name!.text, node.body, src));
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        const name = ts.isIdentifier(decl.name) ? decl.name.text : undefined;
        const init = decl.initializer;
        if (
          name &&
          isReactish(name) &&
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
          init.body &&
          ts.isBlock(init.body)
        ) {
          out.push(...offencesIn(file, name, init.body, src));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return out;
}

describe('hooks below an early return', () => {
  it('do not exist in app/ or components/', () => {
    const offences = ROOTS.flatMap((r) => tsxFiles(r)).flatMap(scan);

    const readable = offences.map(
      (o) =>
        `${o.file}:${o.line} — ${o.fn}() calls ${o.hook}() after the return on line ${o.returnLine}.\n` +
        `    On a render where that return is not taken, this hook runs and the one before it did not.\n` +
        `    Move it above the return; React counts hooks per component instance, not per branch.`
    );

    expect(readable, readable.join('\n\n')).toEqual([]);
  });

  // The guard has to be able to fail, or it is decoration. This is the exact
  // shape of the admin layout bug, kept as a fixture rather than a comment.
  it('catches the shape that shipped', () => {
    const fixture = `
      function AdminLayout({ children }) {
        const [open, setOpen] = useState(false);
        if (pathname === '/admin/login') {
          return children;
        }
        useBodyScrollLock(open);
        return <div>{children}</div>;
      }
    `;
    const src = ts.createSourceFile('fixture.tsx', fixture, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: Offence[] = [];
    ts.forEachChild(src, (n) => {
      if (ts.isFunctionDeclaration(n) && n.body && n.name) {
        found.push(...offencesIn('fixture.tsx', n.name.text, n.body, src));
      }
    });

    expect(found.map((f) => f.hook)).toEqual(['useBodyScrollLock']);
  });

  it('does not object to a hook inside a callback after a return', () => {
    // The common false positive. `useMemo`'s callback body is not this
    // component's hook list, and flagging it would make the rule noise.
    const fixture = `
      function Panel({ rows }) {
        const [open, setOpen] = useState(false);
        if (!rows) return null;
        const handler = () => { somethingUseful(); };
        return <div onClick={handler} />;
      }
    `;
    const src = ts.createSourceFile('fixture.tsx', fixture, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: Offence[] = [];
    ts.forEachChild(src, (n) => {
      if (ts.isFunctionDeclaration(n) && n.body && n.name) {
        found.push(...offencesIn('fixture.tsx', n.name.text, n.body, src));
      }
    });

    expect(found).toEqual([]);
  });
});
