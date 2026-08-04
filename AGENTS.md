<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
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

Preview deployments are disabled for `claude/*` branches (see `vercel.json`):
the preview environment has none of the project's environment variables, so
`prisma migrate deploy` fails there in seconds while the identical commit
builds fine on production. Those red builds were noise, not bugs — don't
chase them, and don't "fix" them by pointing preview at the production
database.
