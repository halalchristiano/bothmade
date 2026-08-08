<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Ship every change to production

Finish the job without being asked twice: **commit, merge to `main`, and push.**
`main` is what deploys to production, so a change that stops at a feature
branch is a change that never reached the site. No pull request is expected —
push the branch ref straight to `main` once the work is done and verified:

    git push origin <your-branch>:main

Two things to check first, because this deploys to a live site:

- `git merge-base --is-ancestor origin/main HEAD` — confirms a clean
  fast-forward, so nothing on `main` gets overwritten.
- Whether the diff touches `prisma/`. Migrations run against the **production
  database** during the build, so say so explicitly before pushing one.

## Several sessions run at once — land work in small pieces

Assume another agent is editing this repo right now. The way to stay out of
its way is to keep your unpushed window small: sync before you start, and
commit and push each finished change on its own rather than batching a
session's worth of work into one drop at the end.

    git fetch origin main && git merge --ff-only origin/main   # before starting
    # ...one coherent change...
    git add -A && git commit && git push origin HEAD:main      # then immediately

If the fast-forward check fails, someone else landed first: `git pull --rebase
origin main`, re-verify, then push. Never force-push `main`.

Preview deployments are disabled for `claude/*` branches (see `vercel.json`):
the preview environment has none of the project's environment variables, so
`prisma migrate deploy` fails there in seconds while the identical commit
builds fine on production. Those red builds were noise, not bugs — don't
chase them, and don't "fix" them by pointing preview at the production
database.
