// Auto-converted data module (zero-build architecture — see docs/DECISIONS.md)
export default {
  "schemaVersion": 1,
  "notes": "All coefficients used by the reduced-order aerodynamic / dynamics models. Every value here is a game abstraction tuned for plausible engineering behaviour, NOT measured data. Exposed via the developer calibration panel (Settings). Units noted per key.",
  "atmosphere": {
    "rho0_kg_per_m3": 1.225,
    "p0_pa": 101325,
    "R_specific": 287.05,
    "T0_k": 288.15
  },
  "reference": {
    "v_ref_kmh": 250,
    "refArea_m2": 1.5,
    "gravity": 9.81
  },
  "frontWing": {
    "cla_slope_m2_per_rad": 8.0,
    "flap_effectiveness": 0.35,
    "ground_gain": 0.55,
    "ground_h0_mm": 45,
    "element_factor_per_extra": 0.12,
    "camber_factor_per_deg": 0.010,
    "stall_aoa_rad": 0.30,
    "stall_sharpness_rad": 0.09,
    "cd_profile_m2": 0.06,
    "oswald_e": 0.85
  },
  "rearWing": {
    "cla_slope_m2_per_rad": 3.6,
    "stall_aoa_rad": 0.62,
    "stall_sharpness_rad": 0.12,
    "cd_profile_m2": 0.10,
    "oswald_e": 0.82,
    "drs_cla_factor": 0.68,
    "drs_cd_induced_factor": 0.35,
    "wake_loss_max": 0.15,
    "upwash_gain_max": 0.10,
    "dirty_air_loss": 0.18
  },
  "floor": {
    "cla_max_m2": 2.05,
    "h_opt_base_mm": 42,
    "front_load_share": 0.25,
    "choke_h0_mm": 9,
    "choke_min_h_mm": 2,
    "stall_x_threshold": 0.45,
    "yaw_crit_deg": 6.5,
    "yaw_loss_max": 0.55,
    "rake_gain_per_deg": 0.25,
    "rake_penalty_per_deg2": 0.09,
    "expansion_gain": 0.9,
    "edge_wing_gain": 0.10
  },
  "diffuser": {
    "sep_start_deg": 13,
    "sep_full_deg": 19,
    "sep_load_loss": 0.55
  },
  "body": {
    "cla_m2": 0.35,
    "cla_front_share": 0.40,
    "cda_base_m2": 0.45,
    "width_exp": 0.8,
    "taper_gain": 0.35,
    "taper_ref": 1.28,
    "shoulder_lift_gain": 0.05,
    "cda_wheels_m2": 0.28,
    "cda_rear_contraction_gain": 0.12
  },
  "cooling": {
    "cda_per_inlet_m2": 0.30,
    "inlet_exponent": 1.3,
    "brake_duct_cda_m2": 0.05,
    "capacity_per_inlet_kw": 145,
    "brake_capacity_per_duct_kw": 58,
    "pu_heat_demand_kw": 88,
    "brake_heat_demand_kw": 30,
    "outlet_flow_factor": 0.9
  },
  "flex": {
    "fw_compliance_deg_per_kn": 0.22,
    "rw_compliance_deg_per_kn": 0.35,
    "iterations": 4
  },
  "porpoising": {
    "flow_lag_ms": 45,
    "sim_seconds": 2.0,
    "dt_ms": 2,
    "bump_amplitude_mm": 2.5
  },
  "suspension": {
    "heave_ref_mm_per_g": 12,
    "pitch_mm_per_g": 4.5,
    "roll_mm_per_g": 3.0,
    "kerb_heave_mm": 3.0
  },
  "tyres": {
    "mu_max": 1.35,
    "mu_brake_scale": 1.02,
    "temp_opt_c": 95,
    "temp_window_c": 70,
    "mu_cold_loss": 0.18,
    "heat_per_glat_c": 6.5,
    "heat_per_glong_c": 5.0,
    "heat_base_c": 2.2,
    "cool_per_ms_c": 0.055,
    "wear_per_g": 0.00028,
    "wear_mu_loss_max": 0.12
  },
  "powertrain": {
    "ice_power_kw": 700,
    "ers_power_kw": 120,
    "battery_capacity_mj": 28,
    "drivetrain_eff": 0.90,
    "ers_deploy_v_kmh": 150,
    "harvest_brake_kw": 90
  },
  "lap": {
    "stations": 700,
    "smoothing_passes": 3,
    "curvature_window": 5,
    "grip_roughness": 1.0,
    "dirty_air_lap_loss_factor": 0.5
  },
  "dirtyAir": {
    "fw_loss": 0.22,
    "floor_loss": 0.14,
    "rw_loss": 0.30,
    "drag_reduction": 0.05
  },
  "manufacturing": {
    "wing_angle_tol_deg": 0.4,
    "ride_height_tol_mm": 2.5,
    "surface_roughness_drag": 0.02
  },
  "development": {
    "correlation_noise": 0.35,
    "prototype_slot_base": 3,
    "tunnel_hours_base": 120,
    "cfd_tokens_base": 200,
    "engineering_hours_base": 400,
    "money_base": 100
  }
};
