# Releasing

1. Write what changed under `## Unreleased` in `CHANGELOG.md` and add an entry at the top of `NOTES` in
   `packages/client/src/releaseNotes.ts` (player wording, per language).
2. Run the gates: `pnpm lint`, `pnpm -r typecheck`, `pnpm test`, `pnpm build`, and the browser checks in `tools/ci`
   (`qa-browsers`, `play-all`, `game-smoke`, `aim-check`, `notes-check`, `check-dist`, `layout-check`; `PLAY_PART=classes1|classes2|arenas|misc` runs a part of `play-all`).
   `net-stutter` is a local tool only (it needs a GPU to mean anything).
3. `pnpm release minor` (or `patch`) bumps the version, moves the changelog and tags it. `git push --follow-tags`.

What happens after the push of the tag `vX.Y.Z`:

| workflow | does |
|---|---|
| `pages` (on the branch push) | tests, builds, publishes the game on GitHub Pages |
| `ci` (every push / PR) | lint, typecheck, tests, build, plus a Chromium smoke (`qa-browsers`, `game-smoke`); about 5 minutes |
| `qa-full` | the complete browser QA in parallel jobs (all three engines, every class and arena, aim, release notes, menu and drone shots, layout); runs on tags, weekly, by hand (`Run workflow`) and when game code or `tools/ci` changes on main |
| `release` | tests, builds, publishes the GitHub release with a zip |
| `relay` | deploys the Cloudflare relay (`packages/relay`) and checks `/version.json` reports the new version |

Multiplayer needs the same `major.minor` on the relay and on every client, so a minor release without a deployed relay
locks players out of online rooms until the relay catches up.

## Secrets for the relay deploy

Repository settings, Secrets and variables, Actions, New repository secret:

- `CLOUDFLARE_API_TOKEN`: a token made from the "Edit Cloudflare Workers" template.
- `CLOUDFLARE_ACCOUNT_ID`: shown on the Workers & Pages overview page (or `npx wrangler whoami`).

Without them the `relay` workflow only prints a warning and succeeds; deploy by hand with
`pnpm --filter @wrh/relay exec wrangler deploy` (after `wrangler login`).
