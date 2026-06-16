/**
 * Short relative label for notification timestamps (recomputed from ms when available).
 * @param {number} createdAtMs
 * @returns {string}
 */
export function formatRelativeTime(createdAtMs) {
  const t = Number(createdAtMs);
  if (!Number.isFinite(t) || t <= 0) return 'Just now';
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
