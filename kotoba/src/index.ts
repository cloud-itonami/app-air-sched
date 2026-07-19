/**
 * air-sched kotoba — barrel.
 *
 * Per ADR-2606011400. Airline flight schedules (public open-data) on the
 * etzhayyim substrate (AT PDS records; no RW).
 *
 *   schedule  : registerSchedule / getSchedule / listSchedules / publishSchedule
 *   slot      : requestSlot (optional FK→schedule) / allocateSlot / listSlots
 *   codeshare : registerCodeshare (FK→schedule) / listCodeshares
 *   coverage
 *
 * Times are integer HHMM; no PII / settlement / liability.
 */

export * from "./types.js";
export {
  registerSchedule,
  getSchedule,
  listSchedules,
  publishSchedule,
  requestSlot,
  allocateSlot,
  listSlots,
  registerCodeshare,
  listCodeshares,
  coverage,
} from "./registry.js";
