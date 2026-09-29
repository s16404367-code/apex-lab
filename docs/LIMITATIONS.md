# LIMITATIONS

Physical and structural simplifications, stated plainly (spec §106, §117, §121).

## Aerodynamics
- Thin-airfoil + empirical corrections. No viscosity, no boundary-layer solution, no real separation prediction (separation is a calibrated threshold).
- Ground effect is a response-curve model of venturi behaviour, not a potential-flow solution.
- Yaw is applied as load-loss factors per component; no asymmetric flow field is solved.
- Wake effects (FW→RW, diffuser→RW, dirty air) are parameterised couplings, not solved flow fields.
- Wing flex is a 1-DoF twist compliance per wing; no bending modes, no aeroelastic flutter.
- Pressure overlay maps component load shares, not local surface Cp.

## Vehicle dynamics & lap sim
- Point-mass (GGV). No yaw moment / 3-DOF, so no true oversteer/understeer moment balance — balance is expressed through grip distribution and axle loads.
- Ride-height response is quasi-static per station (heave + pitch scalars); no inertial transients, no kerb-displacement events.
- DRS timing is rule-based (straight detection), not strategic.
- Tyres: temperature-window grip + scalar wear. No combined-slip friction ellipse, no thermal model per axle, no pressure sensitivity.
- Braking shares, traction limits and ERS deployment are simplified scalars.

## Systems
- Correlation noise in development is a documented abstraction (facility-modulated), not a model of measurement error.
- Facilities/staff data structures ship, but staff effects touch only process math, and facility levels currently affect resources/resolution constants only.
- IndexedDB is best-effort with localStorage fallback; clearing browser data clears progress.
- Service worker caches by first-load version; a hard refresh clears stale assets after repo renames.

## Testing
- 34 automated tests cover invariants and the development loop; there is no browser end-to-end (Playwright) automation in this environment.
- Numeric outputs are tuned for plausible behaviour, NOT fitted to real telemetry — do not treat lap times as predictive of any real car.
