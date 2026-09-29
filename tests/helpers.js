// Shared test fixtures.
import { CarModel } from '../src/core/model.js';
import { buildGeometry } from '../src/core/geometry.js';
import CAL from '../data/calibration/defaults.js';
import BASE from '../data/cars/baseline-car.js';

export function baselineModel(overrides = {}) {
  const m = new CarModel({ ...BASE.params, ...overrides }, { name: 'test' });
  return m;
}

export function baselineContext(overrides = {}) {
  const model = baselineModel(overrides);
  const cal = model.calibration(CAL);
  const { meta } = buildGeometry(model);
  return { model, cal, meta };
}

export { CAL, BASE };
