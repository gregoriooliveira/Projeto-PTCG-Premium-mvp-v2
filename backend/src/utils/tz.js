const TZ = process.env.TZ || "America/Sao_Paulo";

const dateFormatCache = new Map();
function getDateFormatter(timeZone = TZ) {
  const key = String(timeZone || TZ);
  let formatter = dateFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: key,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormatCache.set(key, formatter);
  }
  return formatter;
}

const offsetFormatCache = new Map();
function getOffsetFormatter(timeZone = TZ) {
  const key = String(timeZone || TZ);
  let formatter = offsetFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: key,
      timeZoneName: "shortOffset",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    offsetFormatCache.set(key, formatter);
  }
  return formatter;
}

function extractOffsetMinutes(parts = []) {
  const tzPart = parts.find((part) => part.type === "timeZoneName");
  if (!tzPart) return null;
  const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(tzPart.value || "");
  if (!match) return null;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2] || "0");
  const minutes = Number(match[3] || "0");
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return sign * (hours * 60 + minutes);
}

function parseDateKeyComponents(dateKey) {
  if (typeof dateKey !== "string") return null;
  const trimmed = dateKey.trim();
  if (!trimmed) return null;

  let match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(trimmed);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }

  match = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/.exec(trimmed);
  if (match) {
    return {
      year: Number(match[3]),
      month: Number(match[2]),
      day: Number(match[1]),
    };
  }

  return null;
}

export function dateKeyFromTs(ts, timeZone = TZ) {
  // Format YYYY-MM-DD in target timezone
  const dt = new Date(ts);
  const formatter = getDateFormatter(timeZone);
  const parts = formatter.formatToParts(dt);
  const obj = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}

export function timestampFromDateKey(dateKey, timeZone = TZ) {
  const components = parseDateKeyComponents(dateKey);
  if (!components) return null;
  const { year, month, day } = components;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const baseUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  if (!Number.isFinite(baseUtc)) return null;

  const formatter = getOffsetFormatter(timeZone);
  const parts = formatter.formatToParts(new Date(baseUtc));
  const offsetMinutes = extractOffsetMinutes(parts);
  if (!Number.isFinite(offsetMinutes)) {
    return baseUtc;
  }

  return baseUtc - offsetMinutes * 60 * 1000;
}
