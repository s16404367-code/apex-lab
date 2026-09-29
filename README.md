# APEX LAB V4

**Regulation-constrained F1-style aero design → wind tunnel → lap simulation → R&D development.**
A browser-based engineering sandbox. You are not the driver — you are the aerodynamicist, vehicle dynamics engineer and technical director.

```text
DESIGN → REGULATION CHECK → WIND TUNNEL → AERO ANALYSIS → LAP SIM
      → DIAGNOSIS → HYPOTHESIS → PROTOTYPE → TEST → CORRELATE
      → APPROVE / REJECT → INSTALL → TEST AGAIN → OPTIMISE
```

Runs **entirely client-side**: no backend, no API keys, no runtime network access, offline after first load (service worker). Every number on screen comes from the same reduced-order physics chain — design changes become geometry, geometry becomes forces, forces become lap time.

---

## Design the chassis in SHAPE STUDIO (V4.2)

You don't tune the body with sliders — you **sculpt it**: drag the 12-point side-silhouette and plan-outline curves, watch the 3D car rebuild live, then take the shape to the wind tunnel and lap sim. The solver reads real descriptors integrated from your curves (true frontal area, fineness, deck upwash, nose droop). Share codes (`APEX2-…`) carry the whole sculpted shape.

## Quick start (local)

```bash
npm run dev        # → http://localhost:8000  (zero-dependency static server)
npm test           # 34 physics / model / development acceptance tests (node:test)
npm run verify:regs# regulations provenance check
npm run lint       # syntax check of every module
```

No `npm install` needed — the project has **zero runtime dependencies** and uses only Node/browser built-ins.

## Play

- **DESIGN** — edit the car inside the 3D legal envelope (part tree → inspector sliders). Watch the legality chip and the *WHAT CHANGED* evidence line.
- **WIND TUNNEL** — sweeps (ride height / yaw / speed), contribution ledgers, pressure overlay, flow lines, and a **WHY DID THIS HAPPEN** panel that explains mechanisms.
- **LAP SIM** — three original circuits (Kestrel Ring, Harbor Street, Summit Classic) with a **limiter map**: every station is coloured by the physical limit that binds (aero / grip / power / brake / traction).
- **DEVELOP** — buy engineering concepts, create prototypes that change **real geometry and real model coefficients**, correlate predicted vs tested, approve/reject, install immutable car versions.
- **EXPERIMENTS** — design-of-experiments response curves, 2-variable aero maps, robustness Monte Carlo (manufacturing tolerance + environment), and challenge briefs.
- **COMPARE** — version diff (what *actually* changed) + Pareto frontier of all your designs.

Honesty rules (spec §7, §117): the solver is **not CFD**; regulations marked `game-default` are **not official FIA limits**; failed tests keep their information value.

---

## Deploy to GitHub Pages (get your link)

The repository is **zero-build** — GitHub Pages can serve it exactly as uploaded.

### Option A — simplest (no Actions, ~60 seconds)

1. Create a new repository on GitHub (any name, e.g. `apex-lab`).
2. On the repo page click **uploading an existing file** (or *Add file → Upload files*) and drag the **contents** of this folder (make sure `index.html` is at the **root** of the repo, not inside a subfolder).
3. Commit.
4. Go to **Settings → Pages** (left sidebar).
5. Under **Build and deployment → Source** choose **Deploy from a branch**.
6. Under **Branch** choose `main` and `/ (root)`, click **Save**.
7. Wait 1–2 minutes, reload that page — your link appears at the top:

```text
https://YOURUSERNAME.github.io/REPOSITORY-NAME/
```

### Option B — GitHub Actions (auto-deploys every push)

1. Upload the files including `.github/workflows/deploy.yml`.
2. **Settings → Pages → Source → GitHub Actions**.
3. Every push to `main` now rebuilds the site automatically. The Actions tab shows the progress; the URL is the same as above.

> Subpath note: the app uses relative paths everywhere (`./src/...`), so it works at `username.github.io/repo/` without configuration. If you enable the service worker once and it misbehaves after renaming a repo, hard-refresh (Ctrl+Shift+R) — the old cache is versioned and self-clears.

## Repository layout

```text
index.html                 entry point
public/                    manifest + service worker + icons
data/                      regulations · calibration · cars · tracks · upgrade tree · challenges
src/core/                  CarModel · geometry · regulations · aero · stability · weather · dev system
src/sim/                   lap simulator · tracks · robustness Monte Carlo
src/render/                3D engine · blueprint · charts
src/ui/                    screens (design, tunnel, lap sim, develop, experiments, compare, data)
src/storage/               save system · share codes
tests/                     physics / unit / development acceptance tests
scripts/                   dev server · verify:regs · lint · baseline report
docs/                      MODEL · REGULATIONS · DEVELOPMENT · DECISIONS · STATUS · LIMITATIONS …
.github/workflows/         ci.yml · deploy.yml (Pages)
```

## Tech

Vanilla ES-modules JavaScript, zero npm dependencies. **WebGL 3D via Three.js r170, vendored locally** (`public/vendor/three.module.min.js`, MIT — no CDN, fully offline), Canvas-2D fallback when WebGL is unavailable, Canvas-2D charts, `node:test` suite, GitHub Actions CI. TypeScript checking is available optionally (`tsconfig.json` with `checkJs`). Rationale in [docs/DECISIONS.md](docs/DECISIONS.md).

## License

MIT — see [LICENSE](LICENSE).
