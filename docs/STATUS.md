# STATUS — final engineering report (spec §121)

Brutally honest, per the spec's own instruction. State: **first complete playable loop is real and tested**; the depth layers vary. **V4.2 ships the Shape Studio** — the chassis is designed by sculpting silhouette + planform curves, and the solver consumes the sculpted shape (no body-metric sliders). 42/42 tests, lint 53/53, verify:regs 14 OK.

## IMPLEMENTED (working, tested)

- **SHAPE STUDIO (V4.2)**: draggable 12-point side-silhouette + plan-outline editors; the same sampled curves loft the 3D mesh, feed `shapeAero` descriptors into the solver, and travel through undo/redo, saves, JSON export and APEX2 share codes.

- Parametric **CarModel** (28 parameters, 8 groups) as the single geometry source; 3D viewport, 2D blueprint, legality, aero and saves all read it.
- **FAST aero solver** (<1 ms): FW/RW with stall + flex iterations, venturi floor with choke/stall/rake/yaw, body/wheels/cooling drag, thermal model, contribution **ledger** with two explicit interaction terms, dirty-air mode, DRS.
- **Legality engine** driven by a data ruleset with provenance tiers; parameter ranges extend beyond the limits so illegal cars are constructible and flagged (spec §1.3).
- **Heave-stability / porpoising** oscillator (flow-lag model) with real coupling to damper/platform/throat choices.
- **Wind tunnel**: 8 presets, condition controls, DF/drag/ledger/WHY panels, ride-height & yaw & speed sweep charts, pressure overlay + flow lines + force arrows.
- **Lap simulator** (GGV + dynamic ride heights + tyre window + wear + DRS zones + convergence iteration), 3 original tracks, **limiter map**, sectors, energy, weather (5 presets incl. wet).
- **Robustness Monte Carlo** with manufacturing tolerances, P(stall), P(balance excursion), reproducible seeds.
- **Development system**: upgrade tree (17 concepts, real coeffMod/paramDelta/paramRange effects), prototype workflow (predict → tunnel+track test → correlation → approve/reject → install), immutable version history, garage checkout, notebook, sandbox/season resource modes.
- **Experiments**: DoE sweeps with findings, 2-var aero heatmap, challenge briefs scored on the live car.
- **Compare**: version diff + Pareto scatter. **Share codes** (checksummed, offline), JSON export/import, autosave (localStorage) + IndexedDB run logs, undo/redo, onboarding, engineering-mode flag, calibration panel, service-worker offline.
- **34 automated tests** (aero invariants, lap plausibility, legality, share codes, tracks closure, porpoising sensitivity, full development acceptance loop §97) — all passing. CI workflow runs them.

## APPROXIMATED (documented abstractions, visible to the player)

- All aerodynamics: reduced-order, not CFD; no viscous/BL solution, wake parameterised.
- "Track test" = lap sim + seeded correlation noise (facility-dependent).
- Tyre model = temperature-window + wear scalar; no combined-slip brush model.
- Suspension = 3 multipliers + derived ride-height response; no kinematics.
- Powertrain = fixed power/ERS curves; no deployment strategy layer.
- Staff/facilities data shipped; staff bonuses wired into resources math only lightly.

## NOT IMPLEMENTED (honest list)

- Free 3D NURBS sculpting mode (spec §10) — parametric editing only.
- True 3D VLM/panel solver as the PRECISE tier (architected for it; FAST-refinement ships instead).
- Pressure-tap click-to-probe per exact surface point (per-group pressure mapping ships).
- Development Season calendar with race weekends (§56–57) — resource constraints exist, calendar layer doesn't.
- Manufacturing variant generation/selection UI (tolerances exist inside robustness; no per-variant build flow).
- Rival benchmark teams (§59), audio (§79), photo mode (§80), Playwright e2e automation (§100) — browser-based e2e was not possible in this environment; the loop it should automate is covered by `tests/development/dev.test.js`.

## REGULATIONS

- VERIFIED: **none** — no human has yet transcribed values from the official document (the verification tooling and required fields exist and are enforced by `verify:regs`).
- CANDIDATE: mass-min 768 kg (public 2026 summaries, unverified).
- GAME-DEFAULT: all other 13 rules — never presented as official; honesty banner on the Regulations screen and in the README.

## KNOWN LIMITATIONS

- Physics: see LIMITATIONS.md (summary: no viscosity, scalar tyres, static-balance lap model, GGV not 3-DOF).
- Performance: FAST ≪ 5 ms; full lap ≈ 60–120 ms; robustness 300 samples ≈ 200 ms. No workers used yet (spec asked; the budget never needed them — honest gap).
- Accessibility: keyboard sliders/undo/focus implemented; full screen-reader graph tables not done.

## TOP 3 NEXT IMPROVEMENTS

1. **PRECISE tier = real 3D VLM with ground image** for the wing elements, blended with the underbody model — the biggest honesty upgrade.
2. **Development Season calendar** (rounds, deadlines, finite testing windows) to give the resource system a spine.
3. **Manufacturing variants + rival benchmarks**: generate 5 manufactured copies of an approved part, test them, and race-shadow two fictional benchmark cars on the same tyres.
