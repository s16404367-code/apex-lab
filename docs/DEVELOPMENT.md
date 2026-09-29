# DEVELOPMENT — R&D system guide (spec §31–§59)

## Resources (game abstractions, never car buffs)

Money · Wind-tunnel hours · CFD tokens · Engineering hours · Prototype slots · Manufacturing capacity · Testing days.
**Sandbox mode**: unlimited (learn freely). **Season mode**: finite pools; failed tests still consume them — but their information is retained in the notebook (spec §86).

## Concept → prototype → part

1. **Concepts** (upgrade tree, 17 across 7 branches) unlock engineering capability. Effects are always one of:
   - `coeffMod` — changes a *published* model coefficient (e.g. throat concept: floor `cla_max` ×1.09, `h_opt` +2 mm). Visible in Settings → Calibration after installation.
   - `paramDelta` — moves a real parameter (e.g. weight reduction: mass −12 kg, tolerances +25 %).
   - `paramRange` — widens the legal design space for a parameter (spec: level-unlock without fake stats).
   Concepts carry explicit **risk notes**; several require prerequisites; Materials concepts require the Materials Lab facility in Season mode.
2. **Prototype** = parent version + concept deltas (+ optional manual tweaks). Its *prediction* comes from the same FAST solver + lap sim — no fabricated numbers (spec §97).
3. **Test** = wind-tunnel run + track run with facility-quality correlation noise (documented abstraction, §44). The board shows Predicted vs Tested for DF, drag and lap time, plus correlation error.
4. **Decision** = approve → manufacture → install, or reject (data retained).
5. **Install** = immutable new version (`APEX-00X`), auto-checked-out as the working car; garage can roll back to any ancestor (§90 version tree).

## Example correlation table (from the shipped flow)

```text
                 PREDICTED     TESTED
Downforce          +4.9%        +4.3%
Drag               +0.1%        +0.4%
Lap time           -0.31 s      -0.36 s
Correlation error: 0.6%…12% (facility level dependent)
```

## Robustness gate (spec §94, §99)

Higher-impact parts should pass a ride-height sweep + robustness Monte Carlo before approval — the workflow suggests it on the card, the EXPERIMENTS screen provides the tools, and the acceptance criterion (fastest vs most robust comparison) is exercisable end-to-end today.
