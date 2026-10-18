# Contributing

1. Start with a GitHub issue describing the problem, outcome and acceptance criteria.
2. Branch from `develop`: `feat/<issue>-description`, `fix/<issue>-description`, or another Conventional Commit type.
3. External contributors fork the repository and target upstream `develop`.
4. Submit the smallest coherent change with relevant tests and documentation.
5. Complete the PR checklist, personally review the diff and resolve review conversations before merging.

Feature PRs are squash-merged into `develop`. Release PRs merge `develop` into `main` with a merge commit to preserve ancestry. Never force push or delete either long-lived branch. No independent approval is required while there is one maintainer; CI and self-review are required.

Use Conventional Commits: `type(scope): description`. Types include feat, fix, docs, test, refactor, build, ci, chore, perf and revert. Use the same format for PR titles. Mark breaking changes with `!` and a `BREAKING CHANGE:` footer.

Aim for at most 750–1,000 handwritten additions plus deletions at first review, up to 1,500 after review. Smaller PRs are welcome. Split larger work or explain a cohesive exception. Generated clients, lockfiles and third-party licence text are reported separately; tests, migrations and documentation count.

Use `Refs #123` in feature PRs. Release PRs targeting default branch `main` use `Closes #123` for delivered issues. Release tags use semantic versions and point to `main`. Maintain CHANGELOG.md and upgrade instructions.

Keep application data scoped to a collection. Preserve physical stock invariants and cover transactional behaviour with PostgreSQL tests. Released migrations are immutable: introduce a new migration instead. Do not commit credentials, private collections or camera captures. AI assistance is welcome; contributors remain responsible for all submitted changes.

Contributions are licensed under GPL-3.0-only. Report vulnerabilities according to SECURITY.md.
