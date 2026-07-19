/**
 * air-sched kotoba — schedule + slot + codeshare registries + coverage.
 * AT PDS records (no RW). Slots / codeshares FK-reference an existing schedule
 * (slots optionally). Published schedules are public open-data.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  CODESHARE_COLLECTION,
  SCHEDULE_COLLECTION,
  SLOT_COLLECTION,
  codeshareDidFor,
  codeshareRkey,
  isAirportIata,
  isCarrierIata,
  isDaysOfWeek,
  isHhmm,
  isPosInt,
  scheduleDidFor,
  scheduleRkey,
  slotDidFor,
  slotRkey,
  type AllocateSlotInput,
  type AllocateSlotOutput,
  type CodeshareRecord,
  type CodeshareView,
  type CoverageInput,
  type CoverageOutput,
  type GetScheduleInput,
  type GetScheduleOutput,
  type ListCodesharesInput,
  type ListCodesharesOutput,
  type ListSchedulesInput,
  type ListSchedulesOutput,
  type ListSlotsInput,
  type ListSlotsOutput,
  type PublishScheduleInput,
  type PublishScheduleOutput,
  type RegisterCodeshareInput,
  type RegisterCodeshareOutput,
  type RegisterScheduleInput,
  type RegisterScheduleOutput,
  type RequestSlotInput,
  type RequestSlotOutput,
  type ScheduleRecord,
  type ScheduleView,
  type SlotRecord,
  type SlotStatus,
  type SlotView,
} from "./types.js";

const PAGE_LIMIT = 100;
const DEFAULT_MAX_SCAN = 10_000;

async function exists(e: Etzhayyim, collection: string, rkey: string): Promise<boolean> {
  const resp = await e.read({ collection, rkey }).catch(() => ({ records: [] }));
  return Boolean(resp.records[0]?.value);
}

// ─── Schedule ───────────────────────────────────────────────────────

export async function registerSchedule(e: Etzhayyim, input: RegisterScheduleInput): Promise<RegisterScheduleOutput> {
  if (!input.designator || !input.effectiveFrom) return { status: "rejected", error: "missingRequiredFields" };
  const carrier = input.carrierIata?.toUpperCase();
  const origin = input.originIata?.toUpperCase();
  const dest = input.destIata?.toUpperCase();
  if (!isCarrierIata(carrier ?? "")) return { status: "rejected", error: "invalidCarrierIata" };
  if (!isPosInt(input.flightNumber)) return { status: "rejected", error: "invalidFlightNumber" };
  if (!isAirportIata(origin ?? "") || !isAirportIata(dest ?? "")) return { status: "rejected", error: "invalidAirportIata" };
  if (origin === dest) return { status: "rejected", error: "originEqualsDest" };
  if (!isHhmm(input.depHhmm) || !isHhmm(input.arrHhmm)) return { status: "rejected", error: "invalidHhmm" };
  if (!isDaysOfWeek(input.daysOfWeek)) return { status: "rejected", error: "invalidDaysOfWeek" };
  const designator = input.designator.toUpperCase();
  const rkey = scheduleRkey(designator);
  const existing = await e.read<ScheduleRecord>({ collection: SCHEDULE_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", scheduleUri: existing.records[0].uri, did: existing.records[0].value.did, designator };
  }
  const did = scheduleDidFor(designator);
  const record: ScheduleRecord = {
    did,
    designator,
    carrierIata: carrier!,
    flightNumber: input.flightNumber,
    originIata: origin!,
    destIata: dest!,
    depHhmm: input.depHhmm,
    arrHhmm: input.arrHhmm,
    daysOfWeek: input.daysOfWeek,
    aircraftType: input.aircraftType,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    status: "draft",
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({ collection: SCHEDULE_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "registered", scheduleUri: receipt.uri, did, designator };
}

export async function getSchedule(e: Etzhayyim, input: GetScheduleInput): Promise<GetScheduleOutput> {
  if (!input.designator) return { error: "invalidDesignator" };
  const resp = await e.read<ScheduleRecord>({ collection: SCHEDULE_COLLECTION, rkey: scheduleRkey(input.designator.toUpperCase()) }).catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  return { schedule: { ...r.value, scheduleUri: r.uri } };
}

export async function listSchedules(e: Etzhayyim, input: ListSchedulesInput = {}): Promise<ListSchedulesOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<ScheduleRecord>({ collection: SCHEDULE_COLLECTION, cursor: input.cursor, limit });
  const carrier = input.carrierIata?.toUpperCase();
  const origin = input.originIata?.toUpperCase();
  const dest = input.destIata?.toUpperCase();
  const items: ScheduleView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (carrier && v.carrierIata !== carrier) return false;
      if (origin && v.originIata !== origin) return false;
      if (dest && v.destIata !== dest) return false;
      if (input.status && v.status !== input.status) return false;
      return true;
    })
    .map((r) => ({ ...r.value, scheduleUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

export async function publishSchedule(e: Etzhayyim, input: PublishScheduleInput): Promise<PublishScheduleOutput> {
  if (!input.designator) return { status: "rejected", error: "invalidDesignator" };
  const designator = input.designator.toUpperCase();
  const rkey = scheduleRkey(designator);
  const resp = await e.read<ScheduleRecord>({ collection: SCHEDULE_COLLECTION, rkey }).catch(() => ({ records: [] }));
  const sched = resp.records[0]?.value;
  if (!sched) return { status: "notFound", error: "scheduleNotFound" };
  if (sched.status === "published") return { status: "rejected", error: "alreadyPublished" };
  await e.write({ collection: SCHEDULE_COLLECTION, record: { ...sched, status: "published" } as unknown as Record<string, unknown>, rkey });
  return { status: "published", designator, newStatus: "published" };
}

// ─── Slot ───────────────────────────────────────────────────────────

export async function requestSlot(e: Etzhayyim, input: RequestSlotInput): Promise<RequestSlotOutput> {
  if (!input.slotId || !input.season) return { status: "rejected", error: "missingRequiredFields" };
  const airport = input.airportIata?.toUpperCase();
  if (!isAirportIata(airport ?? "")) return { status: "rejected", error: "invalidAirportIata" };
  if (!isHhmm(input.slotHhmm)) return { status: "rejected", error: "invalidHhmm" };
  if (input.slotType !== "arr" && input.slotType !== "dep") return { status: "rejected", error: "invalidSlotType" };
  let designator: string | undefined;
  if (input.designator) {
    designator = input.designator.toUpperCase();
    if (!(await exists(e, SCHEDULE_COLLECTION, scheduleRkey(designator)))) {
      return { status: "scheduleNotFound", error: `scheduleNotFound:${designator}` };
    }
  }
  const rkey = slotRkey(input.slotId);
  const existing = await e.read<SlotRecord>({ collection: SLOT_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", slotUri: existing.records[0].uri, did: existing.records[0].value.did, slotId: input.slotId };
  }
  const did = slotDidFor(input.slotId);
  const record: SlotRecord = {
    did,
    slotId: input.slotId,
    airportIata: airport!,
    season: input.season.toUpperCase(),
    slotHhmm: input.slotHhmm,
    slotType: input.slotType,
    designator,
    status: "requested",
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({ collection: SLOT_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "requested", slotUri: receipt.uri, did, slotId: input.slotId };
}

export async function allocateSlot(e: Etzhayyim, input: AllocateSlotInput): Promise<AllocateSlotOutput> {
  if (!input.slotId) return { status: "rejected", error: "invalidSlotId" };
  const rkey = slotRkey(input.slotId);
  const resp = await e.read<SlotRecord>({ collection: SLOT_COLLECTION, rkey }).catch(() => ({ records: [] }));
  const slot = resp.records[0]?.value;
  if (!slot) return { status: "notFound", error: "slotNotFound" };
  if (slot.status !== "requested") return { status: "rejected", error: `slotNotRequested:${slot.status}` };
  const newStatus: SlotStatus = input.allocate ? "allocated" : "denied";
  await e.write({ collection: SLOT_COLLECTION, record: { ...slot, status: newStatus } as unknown as Record<string, unknown>, rkey });
  return { status: "updated", slotId: input.slotId, newStatus };
}

export async function listSlots(e: Etzhayyim, input: ListSlotsInput = {}): Promise<ListSlotsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<SlotRecord>({ collection: SLOT_COLLECTION, cursor: input.cursor, limit });
  const airport = input.airportIata?.toUpperCase();
  const designator = input.designator?.toUpperCase();
  const items: SlotView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (airport && v.airportIata !== airport) return false;
      if (input.season && v.season !== input.season.toUpperCase()) return false;
      if (input.status && v.status !== input.status) return false;
      if (designator && v.designator !== designator) return false;
      return true;
    })
    .map((r) => ({ ...r.value, slotUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Codeshare ──────────────────────────────────────────────────────

export async function registerCodeshare(e: Etzhayyim, input: RegisterCodeshareInput): Promise<RegisterCodeshareOutput> {
  if (!input.codeshareId || !input.designator) return { status: "rejected", error: "missingRequiredFields" };
  const marketing = input.marketingCarrierIata?.toUpperCase();
  if (!isCarrierIata(marketing ?? "")) return { status: "rejected", error: "invalidMarketingCarrierIata" };
  if (!isPosInt(input.marketingFlightNumber)) return { status: "rejected", error: "invalidMarketingFlightNumber" };
  const designator = input.designator.toUpperCase();
  if (!(await exists(e, SCHEDULE_COLLECTION, scheduleRkey(designator)))) {
    return { status: "scheduleNotFound", error: `scheduleNotFound:${designator}` };
  }
  const rkey = codeshareRkey(input.codeshareId);
  const existing = await e.read<CodeshareRecord>({ collection: CODESHARE_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", codeshareUri: existing.records[0].uri, did: existing.records[0].value.did, codeshareId: input.codeshareId };
  }
  const did = codeshareDidFor(input.codeshareId);
  const record: CodeshareRecord = {
    did,
    codeshareId: input.codeshareId,
    designator,
    marketingCarrierIata: marketing!,
    marketingFlightNumber: input.marketingFlightNumber,
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({ collection: CODESHARE_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "registered", codeshareUri: receipt.uri, did, codeshareId: input.codeshareId };
}

export async function listCodeshares(e: Etzhayyim, input: ListCodesharesInput = {}): Promise<ListCodesharesOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<CodeshareRecord>({ collection: CODESHARE_COLLECTION, cursor: input.cursor, limit });
  const designator = input.designator?.toUpperCase();
  const marketing = input.marketingCarrierIata?.toUpperCase();
  const items: CodeshareView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (designator && v.designator !== designator) return false;
      if (marketing && v.marketingCarrierIata !== marketing) return false;
      return true;
    })
    .map((r) => ({ ...r.value, codeshareUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Coverage ───────────────────────────────────────────────────────

async function countAll<T>(e: Etzhayyim, collection: string, maxScan: number, onRow: (v: T) => void): Promise<number> {
  let cursor: string | undefined;
  let scanned = 0;
  while (scanned < maxScan) {
    const page = await e.read<T>({ collection, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      if (scanned >= maxScan) break;
      onRow(r.value);
      scanned += 1;
    }
    if (scanned >= maxScan || !page.cursor || page.records.length < PAGE_LIMIT) break;
    cursor = page.cursor;
  }
  return scanned;
}

export async function coverage(e: Etzhayyim, input: CoverageInput = {}): Promise<CoverageOutput> {
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);
  const schedulesByStatus: Record<string, number> = {};
  const scheduleCount = await countAll<ScheduleRecord>(e, SCHEDULE_COLLECTION, maxScan, (v) => {
    schedulesByStatus[v.status] = (schedulesByStatus[v.status] ?? 0) + 1;
  });
  const slotsByStatus: Record<string, number> = {};
  const slotCount = await countAll<SlotRecord>(e, SLOT_COLLECTION, maxScan, (v) => {
    slotsByStatus[v.status] = (slotsByStatus[v.status] ?? 0) + 1;
  });
  const codeshareCount = await countAll<CodeshareRecord>(e, CODESHARE_COLLECTION, maxScan, () => {});
  return {
    scheduleCount,
    slotCount,
    codeshareCount,
    schedulesByStatus,
    slotsByStatus,
    truncated: scheduleCount >= maxScan || slotCount >= maxScan || codeshareCount >= maxScan,
  };
}
