# REGULATIONS — provenance policy (spec §6, §7, §107–§109)

## Tiers

| Tier | Meaning | Enforcement |
|---|---|---|
| `verified` | Manually transcribed from the cited official document by a named human; must record article, document version, issue date, verifier and date. | Enforced |
| `game-default` | Chosen for gameplay. **Never official.** Labelled everywhere it appears. | Enforced |
| `pending` | No usable value yet. | Not enforced |
| `candidate` | Player/developer proposal with a source, not independently reviewed. | Enforced, flagged |

Current ruleset (`data/regulations/regulations-2026.js`): 14 rules. 13 are `game-default`; minimum mass is `candidate` (public 2026 summaries, no human verification recorded). **No value is currently `verified`** — the schema requires article + document version + issue date + verifier + date, and `npm run verify:regs` enforces those fields in CI.

## Honesty notice (shipped in-app)

> This simulator is a game and engineering sandbox. Regulation values marked as verified have been manually transcribed from the cited source. Game-default and pending values are not official FIA limits. This application does not determine real-world regulatory compliance.

## No runtime lookup (spec §109)

The shipped application performs **zero** network requests for rules: no FIA/Wikipedia scraping, no AI APIs, no remote databases. `scripts/research-regulations.mjs`-style manual verification is a development-time human workflow; the verification record lives in the dataset itself.

## Envelope

The 3D envelope rendered in the Design Lab (5600 × 2000 × 950 mm, game-default) is generated from this dataset — not hard-coded in UI files.

## Editing rules

Developer-only proposal flow: add a `candidate` entry with a source; it never silently mutates shipped values. Parameter design ranges intentionally extend **beyond** several limits (RW span 1120 vs 1020, diffuser 19° vs 17°, floor 1900 vs 1800, exit 260 vs 220, FW span 2000 vs 1850, RW height 1000 vs 950) so that legality checking has real work: illegal cars are constructible, flagged, and always the player's informed choice (spec §1.3).
