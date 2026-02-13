// Simple 5-field cron expression parser (minute hour dom month dow).
// Supports: wildcards, specific values, ranges (1-5), steps, comma-separated (1,15,30).
// All times are in UTC.

interface CronField {
  values: number[];
}

interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dom: CronField;    // day of month
  month: CronField;
  dow: CronField;    // day of week (0=Sunday)
}

const FIELD_RANGES: Array<[number, number]> = [
  [0, 59],   // minute
  [0, 23],   // hour
  [1, 31],   // day of month
  [1, 12],   // month
  [0, 6],    // day of week (0=Sun, 6=Sat)
];

function parseField(field: string, min: number, max: number): CronField {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    const trimmed = part.trim();

    if (trimmed === "*") {
      for (let i = min; i <= max; i++) values.add(i);
      continue;
    }

    // Step: */N or M-N/S  (note: regex avoids ambiguity with block comments)
    const stepMatch = /^(\*|(\d+)-(\d+))\/(\d+)$/.exec(trimmed);
    if (stepMatch) {
      const step = parseInt(stepMatch[4], 10);
      if (step <= 0) throw new Error(`Invalid step value: ${step}`);
      let start = min;
      let end = max;
      if (stepMatch[2] !== undefined && stepMatch[3] !== undefined) {
        start = parseInt(stepMatch[2], 10);
        end = parseInt(stepMatch[3], 10);
      }
      for (let i = start; i <= end; i += step) values.add(i);
      continue;
    }

    // Range: M-N
    const rangeMatch = /^(\d+)-(\d+)$/.exec(trimmed);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start > end) throw new Error(`Invalid range: ${start}-${end}`);
      if (start < min || end > max) throw new Error(`Range ${start}-${end} out of bounds [${min}-${max}]`);
      for (let i = start; i <= end; i++) values.add(i);
      continue;
    }

    // Single value
    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num < min || num > max) {
      throw new Error(`Invalid value '${trimmed}' — must be ${min}-${max}`);
    }
    values.add(num);
  }

  return { values: Array.from(values).sort((a, b) => a - b) };
}

export function parseCron(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Expected 5 fields in cron expression, got ${fields.length}: "${expression}"`);
  }

  return {
    minute: parseField(fields[0], FIELD_RANGES[0][0], FIELD_RANGES[0][1]),
    hour: parseField(fields[1], FIELD_RANGES[1][0], FIELD_RANGES[1][1]),
    dom: parseField(fields[2], FIELD_RANGES[2][0], FIELD_RANGES[2][1]),
    month: parseField(fields[3], FIELD_RANGES[3][0], FIELD_RANGES[3][1]),
    dow: parseField(fields[4], FIELD_RANGES[4][0], FIELD_RANGES[4][1]),
  };
}

function fieldMatches(field: CronField, value: number): boolean {
  return field.values.includes(value);
}

// Compute the next execution time (UTC) for a cron expression after the given date.
// Iterates from `after` (exclusive) up to 2 years ahead.
export function getNextRun(expression: string, after?: Date): Date {
  const cron = parseCron(expression);
  const start = after ? new Date(after.getTime()) : new Date();

  // Move to the next minute (cron granularity is 1 minute)
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);

  // Limit search to 2 years to prevent infinite loops
  const limit = new Date(start.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);

  const cursor = new Date(start.getTime());

  while (cursor.getTime() <= limit.getTime()) {
    const month = cursor.getUTCMonth() + 1; // 1-12
    if (!fieldMatches(cron.month, month)) {
      // Skip to next month
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      cursor.setUTCDate(1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }

    const dom = cursor.getUTCDate();
    const dow = cursor.getUTCDay(); // 0=Sun
    if (!fieldMatches(cron.dom, dom) || !fieldMatches(cron.dow, dow)) {
      // Skip to next day
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }

    const hour = cursor.getUTCHours();
    if (!fieldMatches(cron.hour, hour)) {
      // Skip to next hour
      cursor.setUTCHours(cursor.getUTCHours() + 1, 0, 0, 0);
      continue;
    }

    const minute = cursor.getUTCMinutes();
    if (!fieldMatches(cron.minute, minute)) {
      // Skip to next minute
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 1, 0, 0);
      continue;
    }

    // All fields match
    return new Date(cursor.getTime());
  }

  throw new Error(`No matching time found within 2 years for: "${expression}"`);
}
