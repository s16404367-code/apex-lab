# UX — paddock engineering interface (spec §101–§105)

## Layout language
Dark technical interface. Monospace data, uppercase micro-labels, thin borders, one accent cyan. No arcade HUD, no decoration that isn't information.

## Navigation
DESIGN · WIND TUNNEL · LAP SIM · DEVELOP · EXPERIMENTS · COMPARE · REGULATIONS · HANDBOOK · SETTINGS.
The top bar persists: car version, legality, downforce, drag, L/D, balance, thermal, porpoising risk, undo/redo. Autosave indicator.

## First-run onboarding (learn by doing)
Six steps: envelope → make one real edit → tunnel sweep → lap sim limiter map → create a prototype → read the trade-offs. Dismissed permanently after completion.

## Engineering Mode (Settings)
Adds solver metadata (tier, condition numbers, ledger internals) to readouts. Off by default.

## Accessibility
- Every parameter has a numeric input beside its slider; keyboard-only editing works; visible focus rings.
- Colour is never the only channel: limiters have text labels, ledger bars have values, statuses have words (LEGAL/ILLEGAL, PASS/FAIL).
- `prefers-reduced-motion` disables flow animation and transitions.
- Model notes are one click away wherever simulation output is shown (§106): the tunnel's MODEL NOTES panel + docs/MODEL.md.

## Error recovery
A screen that throws renders a recovery panel instead of a white screen; saves validate schema version; corrupt imports are rejected without touching the last valid state (§112).
