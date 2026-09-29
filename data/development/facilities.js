// Auto-converted data module (zero-build architecture — see docs/DECISIONS.md)
export default {
  "schemaVersion": 1,
  "note": "Facility levels modify the development operation itself (throughput, resolution, uncertainty). They never modify car performance directly.",
  "facilities": [
    {
      "id": "wind-tunnel",
      "name": "Wind Tunnel Complex",
      "levels": [
        { "level": 0, "name": "Basic tunnel", "mods": { "tunnelHoursRate": 1.0, "correlationNoise": 1.0, "sweepCostMult": 1.0 } },
        { "level": 1, "name": "Rolling-road upgrade", "cost": { "money": 20 }, "mods": { "tunnelHoursRate": 1.25, "correlationNoise": 0.85, "sweepCostMult": 0.9 } },
        { "level": 2, "name": "Pressure-sensitive rig", "cost": { "money": 45 }, "mods": { "tunnelHoursRate": 1.5, "correlationNoise": 0.7, "sweepCostMult": 0.8 } },
        { "level": 3, "name": "Motion-rig hall", "cost": { "money": 80 }, "mods": { "tunnelHoursRate": 1.8, "correlationNoise": 0.55, "sweepCostMult": 0.7 } }
      ]
    },
    {
      "id": "cfd",
      "name": "CFD Cluster",
      "levels": [
        { "level": 0, "name": "Desktop farm", "mods": { "optimisationBudget": 200, "cfdTokensRate": 1.0 } },
        { "level": 1, "name": "Dedicated cluster", "cost": { "money": 30 }, "mods": { "optimisationBudget": 500, "cfdTokensRate": 1.3 } },
        { "level": 2, "name": "GPU hall", "cost": { "money": 70 }, "mods": { "optimisationBudget": 1200, "cfdTokensRate": 1.6 } }
      ]
    },
    {
      "id": "simulation",
      "name": "Simulation Department",
      "levels": [
        { "level": 0, "name": "Spreadsheet era", "mods": { "robustnessSamples": 200, "sensitivityResolution": 1.0 } },
        { "level": 1, "name": "Dedicated DST team", "cost": { "money": 25 }, "mods": { "robustnessSamples": 500, "sensitivityResolution": 1.3 } },
        { "level": 2, "name": "Optimisation group", "cost": { "money": 55 }, "mods": { "robustnessSamples": 1000, "sensitivityResolution": 1.6 } }
      ]
    },
    {
      "id": "manufacturing",
      "name": "Manufacturing Division",
      "levels": [
        { "level": 0, "name": "Small shop", "mods": { "toleranceMult": 1.0, "prototypeSlots": 3, "buildTimeMult": 1.0 } },
        { "level": 1, "name": "5-axis cell", "cost": { "money": 35 }, "mods": { "toleranceMult": 0.8, "prototypeSlots": 4, "buildTimeMult": 0.8 } },
        { "level": 2, "name": "Autoclave hall", "cost": { "money": 75 }, "mods": { "toleranceMult": 0.6, "prototypeSlots": 6, "buildTimeMult": 0.6 } }
      ]
    },
    {
      "id": "materials-lab",
      "name": "Materials Laboratory",
      "levels": [
        { "level": 0, "name": "None", "mods": { "unlocks": [] } },
        { "level": 1, "name": "Composites lab", "cost": { "money": 28 }, "mods": { "unlocks": [ "mat-wing-stiff", "mat-weight" ] } },
        { "level": 2, "name": "Structural test rig", "cost": { "money": 60 }, "mods": { "unlocks": [ "mat-wing-stiff", "mat-weight" ], "toleranceMult": 0.9 } }
      ]
    }
  ]
};
