# DECISIONS — architecture rationale

## D1 — Zero-build, zero-dependency delivery

The spec's §2 wishlist (Vite + TypeScript + Preact + Three.js) is a means, not an end. The stated mission (§0) is: *runs entirely on GitHub Pages, no backend, no CDN dependencies, offline after first load.* This repository makes that mission structural:

- **Pure ES modules.** The repo root *is* the website. `Deploy from branch` works with zero Actions configuration, and a web-UI file upload produces a working site immediately. A bundler-based setup would force every future contributor through `npm install && npm run build` and make "upload files → get link" impossible.
- **Zero runtime dependencies.** Nothing can rot, break a CDN, or leak a supply chain. The 3D renderer (~450 lines, Canvas 2D, painter's algorithm) and charts (~300 lines) replace ~600 kB of libraries and match the engineering-drawing aesthetic (§102) better than a generic PBR scene.
- **Trade-off accepted:** no JSX, no tree shaking, manual DOM code. Fine at this codebase size. TypeScript strict checking remains available via `tsconfig.json` (`checkJs`) for anyone who wants it — JSDoc types are used on core APIs.

## D2 — Data as ES modules, not fetched JSON

Spec asks for `data/*.json`. Browser `fetch()` of JSON breaks on `file://` and inside sandboxed iframes; `import ... with { type: "json" }` is still unevenly supported. Data ships as `.js` modules with `export default` — same single-source-of-truth property, loadable in browser **and** `node:test` without tooling. The schema/verification role of `regulations.schema.json` is performed by `scripts/verify-regulations.mjs` (structure + provenance validation, runs in CI).

## D3 — One CarModel, many consumers (spec §4, honoured strictly)

`src/core/model.js` → `geometry.js` builds THE mesh + derived dimensions → consumed by the 3D viewport, the 2D blueprint, the legality engine and the aero solver's area estimates. There is no second cosmetic model. The lap simulator, robustness and development system all re-solve from the same params+calibration.

## D4 — Reduced-order aero, two tiers, honestly labelled (spec §14, §106)

FAST = closed-form component models (thin-airfoil slopes + empirical ground gain + venturi response curve + induced drag), < 1 ms. PRECISE behaviour (flex iterations, coupled heave, sweeps) is layered refinement of the same physics, not a separate fake solver. Nothing anywhere is labelled CFD.

## D5 — Porpoising as a real oscillator (spec §20)

A 1-DOF heave oscillator with aero-slope forcing through a flow lag, envelope growth between peaks = risk. Dampers, platform stiffness, throat size and ride height genuinely change the outcome. No random warnings.

## D6 — Legality is non-vacuous (spec §1.3)

Parameter ranges deliberately extend **beyond** regulation limits (e.g. RW span to 1120 mm vs the 1020 limit), so illegal-but-tempting cars are constructible and the rules engine has real work to do. The UI flags them; nothing silently clamps them legal.

## D7 — Development changes the model, not a stat (spec §87, §117)

Concepts either widen design ranges, shift real parameters, or modify published calibration coefficients (`coeffMod`, listed in the Settings calibration panel). There are no levels, no "+X% performance" tokens.

## D8 — Failed tests keep information value (spec §86)

Rejected prototypes stay on the board with their correlation data and write to the notebook. Failure costs resources in Season mode; it never deletes evidence.
