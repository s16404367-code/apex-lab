// Auto-converted data module (zero-build architecture — see docs/DECISIONS.md)
export default {
  "schemaVersion": 1,
  "note": "Fictional staff. Staff modify development process quality (time, uncertainty, correlation) — NEVER direct car performance. Abstraction, documented in docs/DEVELOPMENT.md.",
  "roles": [
    { "id": "aero", "name": "Aerodynamicist", "mods": { "devSpeed": 1.15, "tunnelEfficiency": 1.15 } },
    { "id": "vd", "name": "Vehicle Dynamics Engineer", "mods": { "correlationQuality": 1.2 } },
    { "id": "tyres", "name": "Tyre Engineer", "mods": { "uncertainty": 0.9 } },
    { "id": "structure", "name": "Structural Engineer", "mods": { "prototypeReliability": 1.15 } },
    { "id": "performance", "name": "Performance Engineer", "mods": { "sensitivityResolution": 1.15 } },
    { "id": "manufacturing", "name": "Manufacturing Engineer", "mods": { "toleranceMult": 0.85 } }
  ],
  "hires": [
    { "id": "novak", "name": "D. Novak", "role": "aero", "cost": 18 },
    { "id": "osei", "name": "A. Osei", "role": "vd", "cost": 14 },
    { "id": "tanaka", "name": "R. Tanaka", "role": "tyres", "cost": 12 },
    { "id": "weber", "name": "M. Weber", "role": "structure", "cost": 15 },
    { "id": "ilves", "name": "K. Ilves", "role": "performance", "cost": 16 },
    { "id": "ferrao", "name": "S. Ferrão", "role": "manufacturing", "cost": 13 }
  ]
};
