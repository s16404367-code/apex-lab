# BALANCE — tuning targets and observed behaviour

Reference condition: 250 km/h, 0° yaw, ρ = 1.21, standard weather, baseline APEX-001.

## Baseline anchor points (deterministic — `npm run generate:baseline`)

| Metric | Baseline value | Design intent |
|---|---|---|
| Downforce | ≈ 14 500 N | mid-field; headroom for floor/wing development |
| Aero balance | ≈ 45 %F | slightly front-verbose; rewards rear development on fast tracks |
| Drag / CdA | ≈ 4 750 N / 1.63 m² | top speed ≈ 330–345 km/h with DRS zones |
| L/D | ≈ 3.0 | low-drag packages can reach ≈ 4.5; max-DF ≈ 2.4 |
| Thermal margin | ≈ +14 % | small inlets (0.35×) go negative; big (1.0×) ≈ +60 % |
| Kestrel lap | ≈ 88 s | fast-flowing reference |
| Harbor lap | ≈ 95 s | traction/brake dominated |
| Summit lap | ≈ 125 s | balanced, longest |

## Behaviours verified by tests (the "feel")

- DF ∝ V², drag monotonic with RW angle while attached, collapses past stall.
- Floor curve has an interior peak near hAvg ≈ 40–44 mm (dynamic), chokes below ~15 mm.
- Yaw 7° ⇒ ≈ −18…−25 % DF, balance migrates forward.
- DRS ⇒ −8…−12 % drag, −8 % DF, top speed +6–12 km/h.
- Soft damper + big throat + low ride height ⇒ porpoising risk rises; stiff damper suppresses it.
- Lowering from above the platform optimum adds load; lowering below it loses load (never test-free lunch).
- Street circuit rewards traction/brake setup; flowing circuit rewards L/D and yaw robustness.

## Tuning knobs (all in data/calibration/defaults.js)

Grip scale: `tyres.mu_max`. DF scale: `floor.cla_max_m2`, wing slopes. Drag scale: `body.cda_base_m2`, wing profile terms. Porpoising sensitivity: `porpoising.flow_lag_ms`, `suspension.heave_ref_mm_per_g`. Track difficulty: curvature mix in `data/tracks/*`.
