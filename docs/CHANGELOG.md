# CHANGELOG

## 4.1.0 — 2026-09-29 — WebGL 3D + animations + blueprint fix

### Added
- **Real WebGL 3D** (Three.js r170, vendored locally for offline use): studio lighting, soft shadows, per-part PBR materials, crisp engineering edge lines, ground grid + regulation envelope.
- **Detailed 2026-regulation-style car model**: lofted monocoque body, droop nose, halo + T-cam, airbox + dorsal fin, low sidepods with inlets, floor edge wings, diffuser strakes, multi-element front wing with diveplanes, swan-neck rear wing + beam wing, 2026 wheel-arch fairings, full suspension wishbones, mirrors.
- **Animations**: turntable orbit, **DRS actuator** (flap genuinely swings open around its pivot to the flattened angle), spinning wheels + rolling-road ground scroll in the tunnel, animated flow particles over the car silhouette, smooth camera presets (incl. close-ups: WING, FLOOR).
- **Pressure heatmap** on the 3D surface from the live aero ledger.
- Canvas-2D renderer kept as automatic fallback when WebGL is unavailable (spec §75).

### Fixed
- **2D blueprint now works**: v4.0 drew into a zero-width canvas before modal layout (blank picture). V4.1 waits for layout and renders **true orthographic projections of the actual mesh** (side/plan/front) with auto-derived dimensions, mm grid and a title block.

### Changed
- `buildGeometry` now emits named animation parts (`rearWingFlap`, `wheelFL…`, `halo`, `suspension`…) alongside the flat mesh — the blueprint, legality and solver still read the same single source of truth.
- Service worker cache bumped to v4.1.0 (includes the vendored engine).

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
