// toISOString() always converts to UTC first, which silently shifts the
// calendar date by one day for any timezone ahead of UTC (e.g. India,
// UTC+5:30) whenever local time hasn't yet caught up to the next UTC day
// boundary. Use this instead of `date.toISOString().slice(0, 10)` anywhere
// a LOCAL calendar date (not a timestamp) is needed — it reads the local
// date fields directly instead of round-tripping through UTC.
export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
