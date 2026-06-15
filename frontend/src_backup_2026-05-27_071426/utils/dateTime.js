export const IST_TIMEZONE = 'Asia/Kolkata';

const DEFAULT_DATE_TIME_OPTIONS = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: IST_TIMEZONE
};

function parseBackendDate(value) {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return new Date(value);

  const trimmed = value.trim();
  // Use explicit timezone when present; otherwise treat backend DATETIME as UTC.
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const hasTimezone = /[zZ]|[+\-]\d{2}:?\d{2}$/.test(normalized);
  return new Date(hasTimezone ? normalized : `${normalized}Z`);
}

export function formatDateTimeIST(value, options = {}) {
  if (!value) return 'N/A';

  const date = parseBackendDate(value);
  if (Number.isNaN(date.getTime())) return 'Invalid Date';

  return new Intl.DateTimeFormat('en-IN', {
    ...DEFAULT_DATE_TIME_OPTIONS,
    ...options,
    timeZone: IST_TIMEZONE
  }).format(date);
}

export function formatDateIST(value, options = {}) {
  return formatDateTimeIST(value, {
    hour: undefined,
    minute: undefined,
    ...options
  });
}

export function formatTimeIST(value, options = {}) {
  if (!value) return 'N/A';
  const date = parseBackendDate(value);
  if (Number.isNaN(date.getTime())) return 'Invalid Time';

  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: IST_TIMEZONE,
    ...options
  }).format(date);
}
