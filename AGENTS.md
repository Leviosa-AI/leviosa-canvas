# AGENTS.md

## Repository constraints

The four hard rules in `README.md` define this repository. In particular, **do not expand external dependencies**: imports beyond `konva`, `react`, and `react-konva` fail `package-boundary.test.ts`. Do not weaken that test to accommodate an unapproved dependency.

## Exporting a new module

Add the module to `exports` in `packages/canvas/package.json`. Otherwise consumers get `Cannot find module` during their application build, which this repository's CI may not catch.

## Tests

```sh
npm test          # vitest, jsdom
npm run typecheck
```

Konva needs the `canvas` (node-gyp) development dependency to measure text in jsdom. This is a test-environment dependency, not a runtime dependency, so it does not violate hard rule 1.

**Some acceptance tests live elsewhere.** Gate checks (G0 coordinate conventions, G4 tables/charts, and G6 export parity) and reference comparisons call application modules and remain in `leviosa-frontend`. For substantial engine changes, validate those consumers as well. Use a local package build when sufficient; publishing an `-rc.N` version stays within the user-authorized release scope. This repository's passing CI alone does not prove consumer parity.

## Commits and PRs

- Write commit titles in Korean using `type(scope): <what changed>`.
- Include `by Max Kim (Dindb-dong)` exactly once as the last non-empty line of the PR body.

## Publishing

When release publishing is within the authorized scope, use `git tag canvas-v<version> && git push origin canvas-v<version>`. The workflow checks types, tests, and version/tag consistency, then publishes with OIDC. Do not publish manually with `npm publish`; the initial bootstrap publication was a one-time exception.
