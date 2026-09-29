// Auto-converted data module (zero-build architecture — see docs/DECISIONS.md)
export default {
  "schemaVersion": 1,
  "id": "regulations-2026",
  "title": "APEX LAB Technical Regulations — 2026 Season (game ruleset)",
  "honestyNotice": "This simulator is a game and engineering sandbox. Regulation values marked as verified have been manually transcribed from the cited source. Game-default and pending values are not official FIA limits. This application does not determine real-world regulatory compliance.",
  "referenceVolume": {
    "title": "FIA Formula One Technical Regulations",
    "issue": "game-sandbox reference framework",
    "note": "Articles cited below follow the FIA Technical Regulations numbering convention (Section 3 = body/aerodynamics, Section 4 = weight, Section 1 = definitions). Values with tier 'game-default' were chosen for gameplay and MUST NOT be presented as official limits."
  },
  "envelope": {
    "lengthMax_mm": 5600,
    "widthMax_mm": 2000,
    "heightMax_mm": 950,
    "floor_min_z_mm": 0,
    "tier": "game-default"
  },
  "rules": [
    {
      "id": "width-max",
      "article": "Art. 3.2",
      "name": "Maximum overall width",
      "value": 2000,
      "unit": "mm",
      "tier": "game-default",
      "appliesTo": "trackPlusBody",
      "description": "Total car width including wheels and tyres may not exceed this dimension when viewed in plan."
    },
    {
      "id": "height-max",
      "article": "Art. 3.3",
      "name": "Maximum overall height",
      "value": 950,
      "unit": "mm",
      "tier": "game-default",
      "appliesTo": "rearWingHeight",
      "description": "No part of the car may exceed this height above the reference plane."
    },
    {
      "id": "wheelbase-min",
      "article": "Art. 3.5",
      "name": "Minimum wheelbase",
      "value": 3200,
      "unit": "mm",
      "tier": "game-default",
      "appliesTo": "wheelbase",
      "description": "Distance between front and rear axle centre lines."
    },
    {
      "id": "wheelbase-max",
      "article": "Art. 3.5",
      "name": "Maximum wheelbase",
      "value": 3800,
      "unit": "mm",
      "tier": "game-default",
      "appliesTo": "wheelbase",
      "description": "Upper bound on axle-to-axle distance."
    },
    {
      "id": "mass-min",
      "article": "Art. 4.1",
      "name": "Minimum car mass (without fuel)",
      "value": 768,
      "unit": "kg",
      "tier": "candidate",
      "source": "Public 2026 regulation summaries reported a 768 kg minimum mass; not independently verified by a named human for this repository.",
      "appliesTo": "mass",
      "description": "Car + driver + ballast, without fuel, at any point of the event."
    },
    {
      "id": "fw-span-max",
      "article": "Art. 3.9.4",
      "name": "Front wing maximum span",
      "value": 1850,
      "unit": "mm",
      "tier": "game-default",
      "appliesTo": "frontWingSpan",
      "description": "Front wing may not extend beyond this span measured from the car centreline x2."
    },
    {
      "id": "rw-span-max",
      "article": "Art. 3.10.2",
      "name": "Rear wing maximum span",
      "value": 1020,
      "unit": "mm",
      "tier": "game-default",
      "appliesTo": "rearWingSpan",
      "description": "Rear wing span limit measured between endplates."
    },
    {
      "id": "rw-height-max",
      "article": "Art. 3.10.1",
      "name": "Rear wing maximum height",
      "value": 950,
      "unit": "mm",
      "tier": "game-default",
      "appliesTo": "rearWingHeight",
      "description": "Uppermost point of rear wing structure."
    },
    {
      "id": "diffuser-exit-max",
      "article": "Art. 3.12.8",
      "name": "Diffuser exit height maximum",
      "value": 220,
      "unit": "mm",
      "tier": "game-default",
      "appliesTo": "diffuserExit",
      "description": "Diffuser exit may not exceed this height above the reference plane."
    },
    {
      "id": "diffuser-angle-max",
      "article": "Art. 3.12.9",
      "name": "Diffuser expansion angle maximum",
      "value": 17,
      "unit": "deg",
      "tier": "game-default",
      "appliesTo": "diffuserAngle",
      "description": "Local diffuser expansion may not exceed this angle on the centreline."
    },
    {
      "id": "ride-height-min",
      "article": "Art. 3.14",
      "name": "Minimum static ride height (safety)",
      "value": 10,
      "unit": "mm",
      "tier": "game-default",
      "appliesTo": "rideHeight",
      "description": "Plank/scrutineering safety margin. Front and rear static ride heights must both respect this."
    },
    {
      "id": "floor-width-max",
      "article": "Art. 3.12.2",
      "name": "Floor planform maximum width",
      "value": 1800,
      "unit": "mm",
      "tier": "game-default",
      "appliesTo": "floorWidth",
      "description": "Floor body may not exceed this width outboard of the plank region."
    },
    {
      "id": "drs-activation",
      "article": "Art. 3.10.9 / sporting regs",
      "name": "Active aero — DRS usage policy",
      "value": "zones",
      "unit": "policy",
      "tier": "game-default",
      "appliesTo": "activeAero",
      "description": "In-season simulation, low-drag state may only be used on designated straights. In sandbox/tunnel mode the player may test both states freely."
    },
    {
      "id": "suspension-actuation",
      "article": "Art. 10.1",
      "name": "Suspension must be passive",
      "value": "passive",
      "unit": "policy",
      "tier": "game-default",
      "appliesTo": "suspension",
      "description": "No active ride-height control. Aero-suspension coupling must arise passively from spring/damper characteristics."
    }
  ],
  "regulationChangelog": [
    {
      "version": "1.0.0",
      "date": "2026-09-29",
      "changes": "Initial game ruleset. All values currently game-default tier except mass-min (candidate). No value has completed human verification against the official document."
    }
  ]
};
