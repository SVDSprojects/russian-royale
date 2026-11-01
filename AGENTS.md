# Instructions for contributors and coding agents

Read README.md, CONTRIBUTING.ru.md and the current task before editing.

- Fetch remote changes before starting. Preserve uncommitted user work; do not reset or overwrite it.
- Work in a task branch. Push changes and open a pull request; do not merge or deploy without the owner's authorization for that action.
- Keep existing authentication, server permissions, private game projections, database migrations and durable timers intact. Never replace production authentication with preview accounts.
- Games use fixed public servers. Players may create rooms, not servers. Only admins may rename public servers.
- Never commit secrets, databases, user uploads, imports, exports or dependency folders.
- Run checks appropriate to the change. Build with pnpm build and check Cloudflare types with pnpm exec tsc --noEmit -p cloudflare/tsconfig.json. Report checks actually run.
- Legacy tests expecting private server creation predate the public-server model. Do not restore private server creation merely to satisfy those tests. Update relevant tests when changing those flows.
- Record the final changes, limitations and next step in the pull request. Avoid unrelated rewrites.
