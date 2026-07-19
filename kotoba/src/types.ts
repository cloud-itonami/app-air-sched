/**
 * air-sched kotoba — airline schedule record types.
 *
 * Per ADR-2606011400. air-sched publishes airline flight schedules — PUBLIC
 * open-data (routes / flight numbers / times / aircraft / codeshares; appears in
 * GDS/OAG/timetables). Registry on AT PDS records (replaces RW). ADR-2605172000
 * kotoba.
 *
 * AXIS NOTE (ADR-2605172400): axis-clean public open-data — no PII, no fiat
 * settlement, no operational/safety liability (planning data, not execution).
 * Airport-slot coordination is the one regulated facet, but the resulting
 * schedule is public; slot status is modelled non-custodially.
 *
 * AT-Lexicon: no float. Times are integer HHMM (0..2359). daysOfWeek is a string
 * of ISO weekday digits 1..7 (e.g. "135" = Mon/Wed/Fri).
 *
 * Identity hierarchy:
 *   did:web:air-sched.etzhayyim.com                              — controller
 *   did:web:air-sched.etzhayyim.com:schedule:{designator}        — a flight schedule
 *   did:web:air-sched.etzhayyim.com:slot:{slotId}                — an airport slot
 *   did:web:air-sched.etzhayyim.com:codeshare:{codeshareId}      — a codeshare
 */

export const AIRSCHED_DID_PREFIX = "did:web:air-sched.etzhayyim.com:" as const;

export const SCHEDULE_COLLECTION = "com.etzhayyim.apps.airSched.schedule";
export const SLOT_COLLECTION = "com.etzhayyim.apps.airSched.slot";
export const CODESHARE_COLLECTION = "com.etzhayyim.apps.airSched.codeshare";

// ─── Schedule ───────────────────────────────────────────────────────

export type ScheduleStatus = "draft" | "published";

export interface ScheduleRecord {
  did: string;
  /** Flight designator (carrier + number, e.g. "JL123"), canonical key. */
  designator: string;
  carrierIata: string;
  flightNumber: number;
  originIata: string;
  destIata: string;
  /** Scheduled departure local time, HHMM (0..2359). */
  depHhmm: number;
  /** Scheduled arrival local time, HHMM (0..2359). */
  arrHhmm: number;
  /** ISO weekday digits the flight operates, e.g. "1234567". */
  daysOfWeek: string;
  /** Aircraft type code, e.g. "B789". */
  aircraftType?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: ScheduleStatus;
  createdAt: string;
}
export interface ScheduleView extends ScheduleRecord {
  scheduleUri: string;
}
export interface RegisterScheduleInput {
  designator: string;
  carrierIata: string;
  flightNumber: number;
  originIata: string;
  destIata: string;
  depHhmm: number;
  arrHhmm: number;
  daysOfWeek: string;
  aircraftType?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}
export interface RegisterScheduleOutput {
  status: "registered" | "alreadyExists" | "rejected";
  scheduleUri?: string;
  did?: string;
  designator?: string;
  error?: string;
}
export interface GetScheduleInput {
  designator: string;
}
export interface GetScheduleOutput {
  schedule?: ScheduleView;
  error?: string;
}
export interface ListSchedulesInput {
  carrierIata?: string;
  originIata?: string;
  destIata?: string;
  status?: ScheduleStatus;
  limit?: number;
  cursor?: string;
}
export interface ListSchedulesOutput {
  items: ScheduleView[];
  cursor?: string;
  total: number;
}
export interface PublishScheduleInput {
  designator: string;
}
export interface PublishScheduleOutput {
  status: "published" | "notFound" | "rejected";
  designator?: string;
  newStatus?: ScheduleStatus;
  error?: string;
}

// ─── Slot ───────────────────────────────────────────────────────────

export type SlotType = "arr" | "dep";
export type SlotStatus = "requested" | "allocated" | "denied";

export interface SlotRecord {
  did: string;
  slotId: string;
  airportIata: string;
  /** IATA season, e.g. "S26" / "W26". */
  season: string;
  /** Slot time, HHMM (0..2359). */
  slotHhmm: number;
  slotType: SlotType;
  /** Optional FK → schedule designator the slot is for. */
  designator?: string;
  status: SlotStatus;
  createdAt: string;
}
export interface SlotView extends SlotRecord {
  slotUri: string;
}
export interface RequestSlotInput {
  slotId: string;
  airportIata: string;
  season: string;
  slotHhmm: number;
  slotType: SlotType;
  designator?: string;
}
export interface RequestSlotOutput {
  status: "requested" | "alreadyExists" | "rejected" | "scheduleNotFound";
  slotUri?: string;
  did?: string;
  slotId?: string;
  error?: string;
}
export interface AllocateSlotInput {
  slotId: string;
  /** true = allocate, false = deny. */
  allocate: boolean;
}
export interface AllocateSlotOutput {
  status: "updated" | "notFound" | "rejected";
  slotId?: string;
  newStatus?: SlotStatus;
  error?: string;
}
export interface ListSlotsInput {
  airportIata?: string;
  season?: string;
  status?: SlotStatus;
  designator?: string;
  limit?: number;
  cursor?: string;
}
export interface ListSlotsOutput {
  items: SlotView[];
  cursor?: string;
  total: number;
}

// ─── Codeshare ──────────────────────────────────────────────────────

export interface CodeshareRecord {
  did: string;
  codeshareId: string;
  /** FK → operating schedule designator. */
  designator: string;
  marketingCarrierIata: string;
  marketingFlightNumber: number;
  createdAt: string;
}
export interface CodeshareView extends CodeshareRecord {
  codeshareUri: string;
}
export interface RegisterCodeshareInput {
  codeshareId: string;
  designator: string;
  marketingCarrierIata: string;
  marketingFlightNumber: number;
}
export interface RegisterCodeshareOutput {
  status: "registered" | "alreadyExists" | "rejected" | "scheduleNotFound";
  codeshareUri?: string;
  did?: string;
  codeshareId?: string;
  error?: string;
}
export interface ListCodesharesInput {
  designator?: string;
  marketingCarrierIata?: string;
  limit?: number;
  cursor?: string;
}
export interface ListCodesharesOutput {
  items: CodeshareView[];
  cursor?: string;
  total: number;
}

// ─── Coverage ───────────────────────────────────────────────────────

export interface CoverageInput {
  maxScan?: number;
}
export interface CoverageOutput {
  scheduleCount?: number;
  slotCount?: number;
  codeshareCount?: number;
  schedulesByStatus?: Record<string, number>;
  slotsByStatus?: Record<string, number>;
  truncated?: boolean;
  error?: string;
}

// ─── Validation + helpers ───────────────────────────────────────────

export function isCarrierIata(s: string): boolean {
  return /^[A-Z0-9]{2}$/.test(s);
}
export function isAirportIata(s: string): boolean {
  return /^[A-Z]{3}$/.test(s);
}
export function isHhmm(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 2359 && n % 100 < 60;
}
export function isDaysOfWeek(s: string): boolean {
  return /^[1-7]{1,7}$/.test(s) && new Set(s).size === s.length;
}
export function isPosInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

export function scheduleDidFor(d: string): string {
  return `${AIRSCHED_DID_PREFIX}schedule:${d.toLowerCase()}`;
}
export function scheduleRkey(d: string): string {
  return `schedule-${d.toLowerCase()}`;
}
export function slotDidFor(id: string): string {
  return `${AIRSCHED_DID_PREFIX}slot:${id.toLowerCase()}`;
}
export function slotRkey(id: string): string {
  return `slot-${id.toLowerCase()}`;
}
export function codeshareDidFor(id: string): string {
  return `${AIRSCHED_DID_PREFIX}codeshare:${id.toLowerCase()}`;
}
export function codeshareRkey(id: string): string {
  return `codeshare-${id.toLowerCase()}`;
}
