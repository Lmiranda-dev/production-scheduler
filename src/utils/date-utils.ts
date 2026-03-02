import { Shift, MaintenanceWindow } from "../reflow/types";

// ============================================================================
// Date Utility Functions
// ============================================================================
// All dates are in UTC. No external dependencies needed.
// ============================================================================

/** Parse an ISO date string into a Date object. */
export function parseDate(iso: string): Date {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${iso}`);
  }
  return d;
}

/** Format a Date to ISO 8601 string. */
export function toISO(date: Date): string {
  return date.toISOString();
}

/** Get day of week (0=Sun, 6=Sat) in UTC. */
export function getDayOfWeek(date: Date): number {
  return date.getUTCDay();
}

/** Get hour (0-23) in UTC. */
export function getHour(date: Date): number {
  return date.getUTCHours();
}

/** Get minutes (0-59) in UTC. */
export function getMinutes(date: Date): number {
  return date.getUTCMinutes();
}

/** Create a new Date at a specific hour:minute on the same UTC day. */
export function setTime(date: Date, hour: number, minute: number = 0): Date {
  const d = new Date(date);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

/** Add minutes to a date. */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/** Add days to a date. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Difference between two dates in minutes (a - b). */
export function diffMinutes(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (60 * 1000);
}

/** Check if date is within [start, end). */
export function isWithinRange(date: Date, start: Date, end: Date): boolean {
  return date.getTime() >= start.getTime() && date.getTime() < end.getTime();
}

/** Check if two time ranges overlap: [startA,endA) vs [startB,endB). */
export function rangesOverlap(
  startA: Date, endA: Date,
  startB: Date, endB: Date
): boolean {
  return startA.getTime() < endB.getTime() && startB.getTime() < endA.getTime();
}

// ============================================================================
// Shift-Aware Scheduling
// ============================================================================

/** Get the shift definition for a given day of week. */
export function getShiftForDay(dayOfWeek: number, shifts: Shift[]): Shift | undefined {
  return shifts.find(s => s.dayOfWeek === dayOfWeek);
}

/** Check if a specific moment is within working hours. */
export function isDuringShift(date: Date, shifts: Shift[]): boolean {
  const day = getDayOfWeek(date);
  const shift = getShiftForDay(day, shifts);
  if (!shift) return false;

  const timeInMinutes = getHour(date) * 60 + getMinutes(date);
  return timeInMinutes >= shift.startHour * 60 && timeInMinutes < shift.endHour * 60;
}

/** Check if a moment falls within any maintenance window. */
export function isDuringMaintenance(
  date: Date,
  maintenanceWindows: MaintenanceWindow[]
): boolean {
  return maintenanceWindows.some(mw => {
    const start = parseDate(mw.startDate);
    const end = parseDate(mw.endDate);
    return date.getTime() >= start.getTime() && date.getTime() < end.getTime();
  });
}

/**
 * Get the end-of-maintenance time if `date` is during a maintenance window.
 * Returns null if not during maintenance.
 */
export function getMaintenanceEnd(
  date: Date,
  maintenanceWindows: MaintenanceWindow[]
): Date | null {
  for (const mw of maintenanceWindows) {
    const start = parseDate(mw.startDate);
    const end = parseDate(mw.endDate);
    if (date.getTime() >= start.getTime() && date.getTime() < end.getTime()) {
      return end;
    }
  }
  return null;
}

/**
 * Find the next available working moment from a given date.
 * Skips past non-shift hours and maintenance windows.
 */
export function getNextShiftStart(
  fromDate: Date,
  shifts: Shift[],
  maintenanceWindows: MaintenanceWindow[] = []
): Date {
  let current = new Date(fromDate);

  // Safety: search up to 30 days ahead
  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const day = getDayOfWeek(current);
    const shift = getShiftForDay(day, shifts);

    if (shift) {
      const shiftStart = setTime(current, shift.startHour);
      const shiftEnd = setTime(current, shift.endHour);

      // Determine the candidate time for this day
      let candidate: Date;
      if (current.getTime() <= shiftStart.getTime()) {
        // Before shift start -> use shift start
        candidate = shiftStart;
      } else if (current.getTime() < shiftEnd.getTime()) {
        // Mid-shift -> use current time
        candidate = current;
      } else {
        // Past shift end -> skip to next day
        current = addDays(setTime(current, 0), 1);
        continue;
      }

      // Check if candidate is during maintenance
      const mwEnd = getMaintenanceEnd(candidate, maintenanceWindows);
      if (mwEnd) {
        // Jump past maintenance and re-check
        current = mwEnd;
        continue; // Re-enter loop from the maintenance end time
      }

      return candidate;
    }

    // No shift this day -> advance to next day midnight
    current = addDays(setTime(current, 0), 1);
  }

  throw new Error(
    `No available shift found within 30 days from ${toISO(fromDate)}.`
  );
}

/**
 * Snap a date forward to the nearest valid working moment.
 */
export function snapToWorkingTime(
  date: Date,
  shifts: Shift[],
  maintenanceWindows: MaintenanceWindow[] = []
): Date {
  if (isDuringShift(date, shifts) && !isDuringMaintenance(date, maintenanceWindows)) {
    return date;
  }
  return getNextShiftStart(date, shifts, maintenanceWindows);
}

// ============================================================================
// CRITICAL: Shift-Aware End Date Calculation
// ============================================================================

/**
 * Get all maintenance windows that overlap with a shift block [shiftStart, shiftEnd).
 * Returns them sorted by start time.
 */
function getOverlappingMaintenance(
  shiftStart: Date,
  shiftEnd: Date,
  maintenanceWindows: MaintenanceWindow[]
): Array<{ start: Date; end: Date }> {
  const overlapping: Array<{ start: Date; end: Date }> = [];

  for (const mw of maintenanceWindows) {
    const mwStart = parseDate(mw.startDate);
    const mwEnd = parseDate(mw.endDate);

    if (rangesOverlap(shiftStart, shiftEnd, mwStart, mwEnd)) {
      overlapping.push({
        start: mwStart.getTime() < shiftStart.getTime() ? shiftStart : mwStart,
        end: mwEnd.getTime() > shiftEnd.getTime() ? shiftEnd : mwEnd,
      });
    }
  }

  // Sort by start time
  overlapping.sort((a, b) => a.start.getTime() - b.start.getTime());
  return overlapping;
}

/**
 * Calculate available working minutes from a start point within a single shift,
 * accounting for maintenance windows.
 *
 * Returns an array of continuous work segments: { start, end, minutes }.
 */
function getWorkSegmentsInShift(
  workStart: Date,
  shift: Shift,
  dayDate: Date,
  maintenanceWindows: MaintenanceWindow[]
): Array<{ start: Date; end: Date; minutes: number }> {
  const shiftEnd = setTime(dayDate, shift.endHour);

  // If workStart is at or past shift end, no segments
  if (workStart.getTime() >= shiftEnd.getTime()) return [];

  // Get maintenance windows that overlap with our remaining shift
  const maintenance = getOverlappingMaintenance(workStart, shiftEnd, maintenanceWindows);

  const segments: Array<{ start: Date; end: Date; minutes: number }> = [];
  let cursor = workStart;

  for (const mw of maintenance) {
    // Work segment before this maintenance window
    if (cursor.getTime() < mw.start.getTime()) {
      const segEnd = mw.start;
      const mins = diffMinutes(segEnd, cursor);
      if (mins > 0) {
        segments.push({ start: new Date(cursor), end: segEnd, minutes: mins });
      }
    }
    // Jump past maintenance
    if (mw.end.getTime() > cursor.getTime()) {
      cursor = mw.end;
    }
  }

  // Work segment after all maintenance windows
  if (cursor.getTime() < shiftEnd.getTime()) {
    const mins = diffMinutes(shiftEnd, cursor);
    if (mins > 0) {
      segments.push({ start: new Date(cursor), end: shiftEnd, minutes: mins });
    }
  }

  return segments;
}

/**
 * CRITICAL FUNCTION: Calculate end date for a work order considering:
 * - Shift schedules (work pauses outside shift hours)
 * - Maintenance windows (work pauses during maintenance)
 *
 * Algorithm:
 * 1. Start at the given startDate (must be within a valid shift)
 * 2. Get available work segments in the current shift
 * 3. Consume segments until all durationMinutes are allocated
 * 4. If shift runs out, advance to next shift and repeat
 *
 * Returns the actual clock-time end date.
 */
export function calculateEndDateWithShifts(
  startDate: Date,
  durationMinutes: number,
  shifts: Shift[],
  maintenanceWindows: MaintenanceWindow[] = []
): Date {
  if (durationMinutes <= 0) return new Date(startDate);

  let remaining = durationMinutes;
  let current = snapToWorkingTime(startDate, shifts, maintenanceWindows);

  // Safety: limit iterations to prevent infinite loops
  const MAX_ITERATIONS = 365; // Max days to search

  for (let i = 0; i < MAX_ITERATIONS && remaining > 0; i++) {
    const day = getDayOfWeek(current);
    const shift = getShiftForDay(day, shifts);

    if (!shift) {
      // No shift today, advance to next day
      current = addDays(setTime(current, 0), 1);
      current = snapToWorkingTime(current, shifts, maintenanceWindows);
      continue;
    }

    const shiftEnd = setTime(current, shift.endHour);
    if (current.getTime() >= shiftEnd.getTime()) {
      // Past shift end, advance to next day
      current = addDays(setTime(current, 0), 1);
      current = snapToWorkingTime(current, shifts, maintenanceWindows);
      continue;
    }

    // Get work segments available from current position in this shift
    const segments = getWorkSegmentsInShift(current, shift, current, maintenanceWindows);

    for (const segment of segments) {
      if (remaining <= 0) break;

      // Only use segments that start at or after our current position
      if (segment.end.getTime() <= current.getTime()) continue;

      const segStart = segment.start.getTime() >= current.getTime()
        ? segment.start
        : current;
      const availableInSegment = diffMinutes(segment.end, segStart);

      if (remaining <= availableInSegment) {
        // We finish within this segment
        return addMinutes(segStart, remaining);
      }

      // Consume the entire segment
      remaining -= availableInSegment;
      current = segment.end;
    }

    // Shift exhausted, move to next day
    current = addDays(setTime(current, 0), 1);
    current = snapToWorkingTime(current, shifts, maintenanceWindows);
  }

  if (remaining > 0) {
    throw new Error(
      `Could not allocate ${durationMinutes} working minutes starting from ` +
      `${toISO(startDate)}. ${remaining} minutes remaining after searching ` +
      `${MAX_ITERATIONS} days.`
    );
  }

  return current;
}

/**
 * Calculate available working minutes between two dates,
 * considering shifts and maintenance windows.
 */
export function getWorkingMinutesBetween(
  start: Date,
  end: Date,
  shifts: Shift[],
  maintenanceWindows: MaintenanceWindow[] = []
): number {
  if (end.getTime() <= start.getTime()) return 0;

  let total = 0;
  let current = new Date(start);

  for (let safety = 0; safety < 365; safety++) {
    if (current.getTime() >= end.getTime()) break;

    const day = getDayOfWeek(current);
    const shift = getShiftForDay(day, shifts);

    if (!shift) {
      current = addDays(setTime(current, 0), 1);
      continue;
    }

    const shiftStart = setTime(current, shift.startHour);
    const shiftEnd = setTime(current, shift.endHour);

    // Clamp to our range
    const effectiveStart = current.getTime() > shiftStart.getTime() ? current : shiftStart;
    const effectiveEnd = end.getTime() < shiftEnd.getTime() ? end : shiftEnd;

    if (effectiveStart.getTime() < effectiveEnd.getTime()) {
      const segments = getWorkSegmentsInShift(
        effectiveStart, shift, current, maintenanceWindows
      );
      for (const seg of segments) {
        const segStart = seg.start.getTime() < effectiveStart.getTime()
          ? effectiveStart : seg.start;
        const segEnd = seg.end.getTime() > effectiveEnd.getTime()
          ? effectiveEnd : seg.end;
        if (segStart.getTime() < segEnd.getTime()) {
          total += diffMinutes(segEnd, segStart);
        }
      }
    }

    current = addDays(setTime(current, 0), 1);
  }

  return total;
}
