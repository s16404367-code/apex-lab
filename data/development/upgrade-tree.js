// Auto-converted data module (zero-build architecture — see docs/DECISIONS.md)
export default {
  "schemaVersion": 1,
  "note": "Concepts represent real engineering developments, not stat levels. coeffMod entries change genuine model coefficients (documented in docs/MODEL.md). paramDelta changes real geometry on the prototype. paramRange widens the legal design space for that parameter. Every concept carries explicit risk notes.",
  "branches": [
    {
      "id": "front-wing",
      "name": "Front Wing",
      "concepts": [
        {
          "id": "fw-endplates",
          "name": "FW Outboard Load Distribution",
          "summary": "Revised endplate + outboard cascade philosophy: recovers tip vortex losses, raising wing efficiency at equal geometry.",
          "cost": { "money": 14, "tunnelHours": 16, "cfdTokens": 22, "engineeringHours": 40 },
          "effects": [ { "type": "coeffMod", "path": "frontWing.oswald_e", "mult": 1.08 }, { "type": "paramRange", "param": "fwSpan", "min": 1200, "max": 1900 } ],
          "risk": "Larger legal span increases sensitivity to front-wing stall at extreme flap angles.",
          "requires": []
        },
        {
          "id": "fw-polish",
          "name": "FW Surface & Gap Optimisation",
          "summary": "Element gap re-work and surface finish program: cuts profile drag without touching load.",
          "cost": { "money": 9, "tunnelHours": 12, "cfdTokens": 14, "engineeringHours": 30 },
          "effects": [ { "type": "coeffMod", "path": "frontWing.cd_profile_m2", "mult": 0.88 } ],
          "risk": "None significant. Small effect.",
          "requires": []
        },
        {
          "id": "fw-yaw-vane",
          "name": "Yaw Conditioning Vanes",
          "summary": "Cantilever vanes condition flow into the floor inlet at yaw, delaying underbody load loss.",
          "cost": { "money": 12, "tunnelHours": 20, "cfdTokens": 30, "engineeringHours": 45 },
          "effects": [ { "type": "coeffMod", "path": "floor.yaw_crit_deg", "mult": 1.18 } ],
          "risk": "Adds 0.4 kg and small frontal drag via calibration body.cda_base increase if combined with wide sidepods.",
          "requires": []
        }
      ]
    },
    {
      "id": "floor",
      "name": "Floor",
      "concepts": [
        {
          "id": "floor-throat",
          "name": "Throat Optimisation V2",
          "summary": "Re-shaped inlet throats raise peak underbody load and move the optimum ride height slightly higher.",
          "cost": { "money": 22, "tunnelHours": 30, "cfdTokens": 48, "engineeringHours": 70 },
          "effects": [ { "type": "coeffMod", "path": "floor.cla_max_m2", "mult": 1.09 }, { "type": "coeffMod", "path": "floor.h_opt_base_mm", "add": 2 } ],
          "risk": "Higher peak load deepens the porpoising coupling window. Validate heave stability before racing.",
          "requires": []
        },
        {
          "id": "floor-stall-resist",
          "name": "Stall-Resistant Edge Geometry",
          "summary": "Edge-wing re-profile softens the venturi choke penalty at very low ride heights.",
          "cost": { "money": 18, "tunnelHours": 26, "cfdTokens": 40, "engineeringHours": 60 },
          "effects": [ { "type": "coeffMod", "path": "floor.choke_h0_mm", "mult": 0.78 }, { "type": "coeffMod", "path": "floor.edge_wing_gain", "mult": 1.3 } ],
          "risk": "Edge wing adds drag if run with large edgeWing settings.",
          "requires": [ "floor-throat" ]
        },
        {
          "id": "floor-highrake",
          "name": "High-Rake Platform",
          "summary": "Rear-leg and diffuser inlet development sustains underbody load at increased rake.",
          "cost": { "money": 16, "tunnelHours": 22, "cfdTokens": 34, "engineeringHours": 50 },
          "effects": [ { "type": "coeffMod", "path": "floor.rake_gain_per_deg", "mult": 1.3 } ],
          "risk": "Rake above ~1.4 deg still trips separation. Aggressive rake shifts balance rearward.",
          "requires": []
        }
      ]
    },
    {
      "id": "diffuser",
      "name": "Diffuser",
      "concepts": [
        {
          "id": "diff-recovery",
          "name": "Pressure Recovery Strakes",
          "summary": "Extended strakes delay diffuser separation, recovering load at high expansion angles.",
          "cost": { "money": 13, "tunnelHours": 18, "cfdTokens": 26, "engineeringHours": 40 },
          "effects": [ { "type": "coeffMod", "path": "diffuser.sep_load_loss", "mult": 0.8 } ],
          "risk": "Encourages running diffAngle near the 17 deg limit; legal-but-fragile territory.",
          "requires": []
        }
      ]
    },
    {
      "id": "rear-wing",
      "name": "Rear Wing",
      "concepts": [
        {
          "id": "rw-efficiency",
          "name": "RW Low-Drag Element Set",
          "summary": "New mainplane/fOTP profiles raise span efficiency: less induced drag at equal load.",
          "cost": { "money": 15, "tunnelHours": 20, "cfdTokens": 30, "engineeringHours": 42 },
          "effects": [ { "type": "coeffMod", "path": "rearWing.oswald_e", "mult": 1.07 } ],
          "risk": "None significant.",
          "requires": []
        },
        {
          "id": "rw-active",
          "name": "Active Aero Actuation V2",
          "summary": "Faster, deeper DRS transition with improved sealing when open.",
          "cost": { "money": 11, "tunnelHours": 14, "cfdTokens": 20, "engineeringHours": 36 },
          "effects": [ { "type": "coeffMod", "path": "rearWing.drs_cd_induced_factor", "mult": 0.8 }, { "type": "coeffMod", "path": "rearWing.drs_cla_factor", "mult": 0.96 } ],
          "risk": "Deeper stall of the flap increases balance change on actuation; check transition behaviour.",
          "requires": [ "rw-efficiency" ]
        }
      ]
    },
    {
      "id": "suspension",
      "name": "Suspension & Platform",
      "concepts": [
        {
          "id": "susp-heave",
          "name": "Heave Control Package",
          "summary": "Third-element rework: platform rises less with speed, holding the aero window. Real model change, not a grip bonus.",
          "cost": { "money": 12, "tunnelHours": 8, "cfdTokens": 8, "engineeringHours": 34 },
          "effects": [ { "type": "coeffMod", "path": "suspension.heave_ref_mm_per_g", "mult": 0.85 } ],
          "risk": "A stiffer platform transmits more load spike into the tyres on kerbs.",
          "requires": []
        },
        {
          "id": "susp-dampers",
          "name": "Damper & Inertia Package",
          "summary": "High-rate damper strategy suppresses heave-mode oscillation growth (porpoising).",
          "cost": { "money": 10, "tunnelHours": 10, "cfdTokens": 12, "engineeringHours": 30 },
          "effects": [ { "type": "coeffMod", "path": "porpoising.flow_lag_ms", "mult": 0.82 } ],
          "risk": "Stiffer low-speed damping slightly reduces kerb compliance.",
          "requires": []
        },
        {
          "id": "susp-geo",
          "name": "Suspension Geometry Rework",
          "summary": "Anti-dive / anti-squat and roll-centre work: less aero-surface disturbance under longitudinal and lateral load.",
          "cost": { "money": 15, "tunnelHours": 12, "cfdTokens": 18, "engineeringHours": 44 },
          "effects": [ { "type": "coeffMod", "path": "suspension.pitch_mm_per_g", "mult": 0.85 }, { "type": "coeffMod", "path": "suspension.roll_mm_per_g", "mult": 0.85 } ],
          "risk": "Changes geometric camber behaviour; tyre wear proxy increases slightly if pushed.",
          "requires": [ "susp-heave" ]
        }
      ]
    },
    {
      "id": "materials",
      "name": "Materials & Structure",
      "concepts": [
        {
          "id": "mat-wing-stiff",
          "name": "Wing Structural Stiffness",
          "summary": "Higher-modulus spar caps: wings deform less under load (less twist-off at speed).",
          "cost": { "money": 20, "tunnelHours": 10, "cfdTokens": 10, "engineeringHours": 38 },
          "effects": [ { "type": "coeffMod", "path": "flex.fw_compliance_deg_per_kn", "mult": 0.7 }, { "type": "coeffMod", "path": "flex.rw_compliance_deg_per_kn", "mult": 0.7 }, { "type": "paramDelta", "param": "mass", "delta": 4 } ],
          "risk": "+4 kg mass. Check minimum-mass legality still holds with ballast strategy.",
          "requires": []
        },
        {
          "id": "mat-weight",
          "name": "Structural Weight Reduction",
          "summary": "Topology-optimised castings: −12 kg. Thinner sections are harder to build consistently.",
          "cost": { "money": 24, "tunnelHours": 6, "cfdTokens": 6, "engineeringHours": 46 },
          "effects": [ { "type": "paramDelta", "param": "mass", "delta": -12 }, { "type": "coeffMod", "path": "manufacturing.wing_angle_tol_deg", "mult": 1.25 }, { "type": "coeffMod", "path": "manufacturing.ride_height_tol_mm", "mult": 1.2 } ],
          "risk": "Manufacturing tolerance degrades: robustness of every installed part decreases.",
          "requires": []
        }
      ]
    },
    {
      "id": "cooling",
      "name": "Cooling",
      "concepts": [
        {
          "id": "cool-radiator",
          "name": "Radiator Core Efficiency",
          "summary": "Higher-conductivity cores extract more heat per unit of inlet area.",
          "cost": { "money": 14, "tunnelHours": 8, "cfdTokens": 12, "engineeringHours": 32 },
          "effects": [ { "type": "coeffMod", "path": "cooling.capacity_per_inlet_kw", "mult": 1.18 } ],
          "risk": "None significant. Enables smaller inlets later.",
          "requires": []
        },
        {
          "id": "cool-ducting",
          "name": "Duct Flow Optimisation",
          "summary": "CFD-shaped ducting recovers losses: same cooling flow for less drag.",
          "cost": { "money": 12, "tunnelHours": 14, "cfdTokens": 24, "engineeringHours": 36 },
          "effects": [ { "type": "coeffMod", "path": "cooling.cda_per_inlet_m2", "mult": 0.85 }, { "type": "coeffMod", "path": "cooling.brake_duct_cda_m2", "mult": 0.85 } ],
          "risk": "Flow separation risk in the duct at extreme yaw (not separately modelled — noted in LIMITATIONS).",
          "requires": []
        }
      ]
    }
  ]
};
