// APEX LAB — atmosphere / weather (spec §61). Small, physical, honest.

import { clamp } from './util.js';

/**
 * Air density from ISA-style relations. altitudeM optional (game tracks are
 * near sea level unless stated).
 */
export function airDensity({ tempC = 25, pressurehPa = 1013, humidity = 0.4 } = {}) {
  const T = tempC + 273.15;
  const p = pressurehPa * 100;
  // vapour pressure (Tetens)
  const pv = humidity * 610.78 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const pd = p - pv;
  const R = 287.05;
  const Rv = 461.5;
  return (pd / (R * T)) + (pv / (Rv * T));
}

export const WEATHER_PRESETS = {
  standard: { tempC: 25, pressurehPa: 1013, humidity: 0.4, trackTempC: 38, wet: 0, windKmh: 0, windDirDeg: 0, label: 'Standard — 25°C' },
  hot: { tempC: 36, pressurehPa: 1006, humidity: 0.55, trackTempC: 52, wet: 0, windKmh: 6, windDirDeg: 40, label: 'Hot & humid — 36°C' },
  cold: { tempC: 12, pressurehPa: 1022, humidity: 0.35, trackTempC: 18, wet: 0, windKmh: 10, windDirDeg: 300, label: 'Cold & clear — 12°C' },
  damp: { tempC: 19, pressurehPa: 1008, humidity: 0.85, trackTempC: 22, wet: 0.4, windKmh: 8, windDirDeg: 200, label: 'Damp' },
  wet: { tempC: 17, pressurehPa: 1002, humidity: 0.95, trackTempC: 19, wet: 1, windKmh: 14, windDirDeg: 180, label: 'Wet' }
};

export function gripScale(weather) {
  // Wet grip scale — simplified, documented in MODEL.md.
  return clamp(1 - 0.28 * (weather.wet ?? 0), 0.72, 1);
}
