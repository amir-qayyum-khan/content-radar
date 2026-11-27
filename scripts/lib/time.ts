const TZ = 'Asia/Karachi';

/** YYYY-MM-DD in Pakistan time. The 04:00 PKT run is still "yesterday" in UTC. */
export function todayPKT(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** e.g. "27 Nov, 04:40 PKT" */
export function formatPKT(d: Date): string {
  const s = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${s} PKT`;
}
