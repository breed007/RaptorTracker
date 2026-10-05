/**
 * Fuel economy, measured full tank to full tank.
 *
 * A tank's figure is the distance since the last full fill-up over all the
 * fuel bought since then (any partial fills in between plus this one). A gap
 * the owner flagged as a missed fill-up has unrecorded fuel in it, so it gets
 * no figure. The average is total distance over total fuel across measured
 * tanks, so a short top-up tank doesn't weigh as much as a long one.
 *
 * Values stay in stored units (distance per volume); the client converts.
 */
function economy(entriesByOdometer) {
  const entries = entriesByOdometer;
  const segments = [];
  const withMpg = entries.map((e, i) => {
    let mpg = null;
    if (e.full_tank && e.gallons > 0) {
      let fuel = e.gallons;
      let missed = Boolean(e.missed_previous);
      for (let j = i - 1; j >= 0; j--) {
        if (entries[j].full_tank) {
          const miles = e.odometer - entries[j].odometer;
          if (miles > 0 && !missed) {
            mpg = Math.round((miles / fuel) * 10) / 10;
            segments.push({ miles, fuel });
          }
          break;
        }
        fuel += entries[j].gallons || 0;
        if (entries[j].missed_previous) missed = true;
      }
    }
    return { ...e, mpg };
  });
  const distance = segments.reduce((s, x) => s + x.miles, 0);
  const fuel = segments.reduce((s, x) => s + x.fuel, 0);
  return { withMpg, segments, average: segments.length ? Math.round((distance / fuel) * 10) / 10 : null };
}

module.exports = { economy };
