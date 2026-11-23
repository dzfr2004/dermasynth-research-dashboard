// Pure headline logic for the Living Sky hero, kept free of DOM-dependent
// imports so it can be unit tested directly under Node (see evaluate-impact.mjs).
export function skyHeadline(r = {}, now = new Date()) {
  const uv = Math.max(Number(r.uvi) || 0, Number(r.uviMaxToday) || 0);
  const pm = Number(r.pm25);
  const hum = Number(r.humidity);
  const temp = Number(r.temperature);
  const isCold = Number.isFinite(temp) && temp <= 15;
  const hour = now.getHours();
  if (hour >= 20 || hour < 6) {
    if (uv >= 6 && pm >= 55) return "Tonight, wash off the sun and the haze.";
    if (uv >= 6) return "Tonight, cleanse off today's sunscreen.";
    if (pm >= 55) return "Tonight, cleanse away the haze.";
    return "A quiet night. Time for your skin to repair.";
  }
  if (uv >= 8 && pm >= 55) return "Strong sun and hazy air today.";
  if (uv >= 8) return "Strong sun today. Sunscreen leads.";
  if (pm >= 55) return "Hazy air today. Protect, then cleanse well.";
  if (hum >= 80 && isCold) return "Cold and humid today. Keep your skin barrier covered.";
  if (hum >= 80) return "Warm and humid. Keep your layers light.";
  if (isCold) return "Cold today. Give your skin extra moisture.";
  if (Number.isFinite(hum) && hum < 45) return "Dry air today. Hold on to moisture.";
  return "A mild day for your skin.";
}
