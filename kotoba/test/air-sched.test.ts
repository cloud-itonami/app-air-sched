import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
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
} from "../src/index.js";

const base = {
  carrierIata: "JL",
  flightNumber: 123,
  originIata: "HND",
  destIata: "ITM",
  depHhmm: 830,
  arrHhmm: 945,
  daysOfWeek: "12345",
  aircraftType: "B789",
  effectiveFrom: "2026-07-01",
};

describe("air-sched kotoba", () => {
  let e: any;
  beforeEach(() => {
    e = new MockEtzhayyim({ did: "did:web:air-sched.etzhayyim.com" });
  });

  describe("schedule", () => {
    it("registers, reads, lists by route, publishes; idempotent", async () => {
      expect((await registerSchedule(e, { designator: "JL123", ...base })).status).toBe("registered");
      expect((await getSchedule(e, { designator: "jl123" })).schedule?.aircraftType).toBe("B789");
      expect((await registerSchedule(e, { designator: "JL123", ...base })).status).toBe("alreadyExists");
      expect((await listSchedules(e, { carrierIata: "JL", originIata: "HND" })).total).toBe(1);
      expect((await publishSchedule(e, { designator: "JL123" })).newStatus).toBe("published");
      expect((await publishSchedule(e, { designator: "JL123" })).status).toBe("rejected");
      expect((await listSchedules(e, { status: "published" })).total).toBe(1);
    });
    it("rejects invalid carrier/airport/hhmm/days/same-route", async () => {
      expect((await registerSchedule(e, { designator: "X", ...base, carrierIata: "JAL" })).status).toBe("rejected");
      expect((await registerSchedule(e, { designator: "X", ...base, originIata: "HN" })).status).toBe("rejected");
      expect((await registerSchedule(e, { designator: "X", ...base, depHhmm: 875 })).status).toBe("rejected"); // 75 min invalid
      expect((await registerSchedule(e, { designator: "X", ...base, daysOfWeek: "128" })).status).toBe("rejected");
      expect((await registerSchedule(e, { designator: "X", ...base, destIata: "HND" })).status).toBe("rejected"); // origin==dest
    });
  });

  describe("slot + codeshare against a schedule", () => {
    beforeEach(async () => {
      await registerSchedule(e, { designator: "JL123", ...base });
    });
    it("requests + allocates/denies slots (FK optional)", async () => {
      expect((await requestSlot(e, { slotId: "S-1", airportIata: "HND", season: "S26", slotHhmm: 830, slotType: "dep", designator: "JL123" })).status).toBe("requested");
      expect((await requestSlot(e, { slotId: "S-2", airportIata: "HND", season: "S26", slotHhmm: 900, slotType: "dep", designator: "GHOST" })).status).toBe("scheduleNotFound");
      // standalone slot (no FK) allowed
      expect((await requestSlot(e, { slotId: "S-3", airportIata: "ITM", season: "S26", slotHhmm: 945, slotType: "arr" })).status).toBe("requested");
      expect((await allocateSlot(e, { slotId: "S-1", allocate: true })).newStatus).toBe("allocated");
      expect((await allocateSlot(e, { slotId: "S-3", allocate: false })).newStatus).toBe("denied");
      expect((await allocateSlot(e, { slotId: "S-1", allocate: true })).status).toBe("rejected"); // not requested anymore
      expect((await listSlots(e, { airportIata: "HND", status: "allocated" })).total).toBe(1);
    });
    it("registers codeshares (FK) and rejects missing schedule", async () => {
      expect((await registerCodeshare(e, { codeshareId: "C-1", designator: "JL123", marketingCarrierIata: "AA", marketingFlightNumber: 8421 })).status).toBe("registered");
      expect((await registerCodeshare(e, { codeshareId: "C-2", designator: "GHOST", marketingCarrierIata: "AA", marketingFlightNumber: 1 })).status).toBe("scheduleNotFound");
      expect((await listCodeshares(e, { marketingCarrierIata: "AA" })).total).toBe(1);
    });
    it("coverage rolls up the three collections", async () => {
      await requestSlot(e, { slotId: "S-1", airportIata: "HND", season: "S26", slotHhmm: 830, slotType: "dep", designator: "JL123" });
      await allocateSlot(e, { slotId: "S-1", allocate: true });
      await registerCodeshare(e, { codeshareId: "C-1", designator: "JL123", marketingCarrierIata: "AA", marketingFlightNumber: 8421 });
      const cov = await coverage(e);
      expect(cov.scheduleCount).toBe(1);
      expect(cov.slotCount).toBe(1);
      expect(cov.codeshareCount).toBe(1);
      expect(cov.schedulesByStatus?.draft).toBe(1);
      expect(cov.slotsByStatus?.allocated).toBe(1);
    });
  });
});
