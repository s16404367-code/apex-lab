// Auto-converted data module (zero-build architecture — see docs/DECISIONS.md)
export default {
  "schemaVersion": 1,
  "note": "Design briefs evaluated against live simulation of the CURRENT car. Medals reflect multiple criteria; a design can be strong in one dimension and weak in another.",
  "challenges": [
    {
      "id": "efficiency-run",
      "name": "Downforce Without the Drag Bill",
      "brief": "Kestrel Ring punishes drag. Raise aerodynamic efficiency (L/D) well above the baseline without giving away lap time.",
      "track": "kestrel-ring",
      "metrics": {
        "ldRatio": { "target": 4.2, "compare": ">=", "label": "L/D at 250 km/h" },
        "lapDeltaPct": { "target": -0.5, "compare": "<=", "label": "Lap time vs baseline (%)" }
      },
      "medals": { "gold": { "ldRatio": 4.6 }, "silver": { "ldRatio": 4.2 } }
    },
    {
      "id": "survive-yaw",
      "name": "Survive the Crosswind",
      "brief": "Keep the underbody alive at yaw. Minimise downforce loss and balance migration across a 0-7 degree sweep.",
      "track": null,
      "metrics": {
        "yawDfLoss7": { "target": 25, "compare": "<=", "label": "DF loss at 7 deg yaw (%)" },
        "yawBalanceShift7": { "target": 2.5, "compare": "<=", "label": "Balance shift at 7 deg (points)" }
      },
      "medals": { "gold": { "yawDfLoss7": 18 }, "silver": { "yawDfLoss7": 25 } }
    },
    {
      "id": "stall-edge",
      "name": "Dance on the Stall Edge",
      "brief": "Extract floor load at an average dynamic ride height of 26 mm or below — without entering the stall regime.",
      "track": null,
      "metrics": {
        "floorDfLowH": { "target": 5500, "compare": ">=", "label": "Floor+diffuser DF at 26 mm, 250 km/h (N)" },
        "stallRisk": { "target": 15, "compare": "<=", "label": "Stall probability in robustness test (%)" }
      },
      "medals": { "gold": { "floorDfLowH": 6500 }, "silver": { "floorDfLowH": 5500 } }
    },
    {
      "id": "street-package",
      "name": "Harbor Street Package",
      "brief": "Build a car for the street: beat the baseline lap with cooling margin intact — small inlets are not free.",
      "track": "harbor-street",
      "metrics": {
        "lapDeltaPct": { "target": -1.0, "compare": "<=", "label": "Lap time vs baseline (%)" },
        "thermalMargin": { "target": 10, "compare": ">=", "label": "Thermal margin (%)" }
      },
      "medals": { "gold": { "lapDeltaPct": -1.6 }, "silver": { "lapDeltaPct": -1.0 } }
    }
  ]
};
