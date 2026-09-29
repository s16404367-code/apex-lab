# CHANGELOG

## 4.0.0 — 2026-09-29

Initial complete playable build.

### Added
- CarModel single-source-of-truth parametric car (28 parameters, 8 groups).
- FAST reduced-order aero solver: FW/RW (stall, flex), venturi floor (choke, stall, rake, yaw), body/cooling drag, thermal margins, contribution ledger with FW-wake and diffuser-upwash interaction terms, dirty air, DRS.
- Heave-stability (porpoising) oscillator with flow lag.
- Legality engine + provenance-tiered regulations dataset + verify:regs CI gate.
- Wind tunnel: presets, sweeps (ride height / yaw / speed), ledgers, WHY panel, pressure overlay, flow lines, force arrows.
- Lap simulator (GGV, dynamic ride heights, tyre window + wear, DRS zones, limiter map, sectors, energy) + 3 original tracks.
- Robustness Monte Carlo (tolerances, environment, reproducible seeds).
- Development system: upgrade tree, prototypes, correlation testing, install/reject, immutable versions, notebook, sandbox/season resource modes.
- Experiments: DoE sweeps, aero heatmap, challenges. Compare: version diff + Pareto.
- Save/load (localStorage + IndexedDB), share codes, JSON export/import, undo/redo, onboarding, service-worker offline mode.
- 34 zero-dependency tests, CI workflow, Pages deploy workflow, full documentation set.
