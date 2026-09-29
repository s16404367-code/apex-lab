// generate:baseline — sanity-report the baseline car against the solvers.
// Regenerates nothing silently: prints the numbers the shipped baseline produces.
import BASE from '../data/cars/baseline-car.js';
import CAL from '../data/calibration/defaults.js';
import { CarModel } from '../src/core/model.js';
import { buildGeometry } from '../src/core/geometry.js';
import { evalReference } from '../src/core/aero.js';
import { checkLegality } from '../src/core/regulations.js';
import { prepareTrack } from '../src/sim/tracks.js';
import { simulateLap } from '../src/sim/lap.js';
import T1 from '../data/tracks/kestrel-ring.js';

const model = new CarModel(BASE.params, { name: BASE.name });
const cal = model.calibration(CAL);
const { meta } = buildGeometry(model);
const ref = evalReference(model, cal, meta);
const legality = checkLegality(model);
const lap = simulateLap(model, cal, meta, prepareTrack(T1, 700));

console.log('APEX-001 Baseline report (regenerated deterministically from data):');
console.log(`  legality        : ${legality.legal ? 'LEGAL' : 'ILLEGAL'}`);
console.log(`  DF @250 km/h    : ${Math.round(ref.df.total)} N (balance ${ref.df.balancePct.toFixed(1)}%F)`);
console.log(`  drag            : ${Math.round(ref.drag)} N (CdA ${ref.cdA.toFixed(2)} m²)`);
console.log(`  L/D             : ${ref.ld.toFixed(2)}`);
console.log(`  thermal margin  : ${ref.thermal.marginPct.toFixed(0)}%`);
console.log(`  Kestrel lap     : ${lap.timeS.toFixed(2)} s (top ${lap.topSpeedKmh.toFixed(0)} km/h)`);
console.log(`  hash            : ${model.hash}`);
