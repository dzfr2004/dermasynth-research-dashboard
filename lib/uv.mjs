/**
 * UV used to plan the day (improvement 3): a morning routine should prepare
 * for the day's peak, not the reading at the moment the routine was built.
 * When the forecast supplies today's maximum (readings.uviMaxToday), the
 * larger of that and the current reading is used for the sun-protection
 * decision; otherwise the current reading is used, exactly as before.
 */
export function planningUvi(readings = {}) {
  const now = Number(readings?.uvi);
  const peak = Number(readings?.uviMaxToday);
  const hasNow = readings?.uvi !== null && readings?.uvi !== undefined && Number.isFinite(now);
  const hasPeak = readings?.uviMaxToday !== null && readings?.uviMaxToday !== undefined && Number.isFinite(peak);
  if (hasNow && hasPeak) return Math.max(now, peak);
  if (hasPeak) return peak;
  return hasNow ? now : null;
}

export function usesTodayPeak(readings = {}) {
  const peak = Number(readings?.uviMaxToday);
  return readings?.uviMaxToday !== null && readings?.uviMaxToday !== undefined && Number.isFinite(peak) && peak > Number(readings?.uvi ?? -1);
}
