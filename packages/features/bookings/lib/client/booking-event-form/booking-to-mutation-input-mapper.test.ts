// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mapBookingToMutationInput } from "./booking-to-mutation-input-mapper";

const baseOptions = {
  values: {},
  event: { id: 1, length: 15, slug: "15min", schedulingType: null, recurringEvent: null },
  date: "2026-07-27T13:00:00.000Z",
  duration: undefined,
  timeZone: "America/Santiago",
  rescheduleUid: undefined,
  rescheduledBy: undefined,
  username: "admin",
};

describe("mapBookingToMutationInput", () => {
  it("forces Spanish as the booking language regardless of the browser language", () => {
    const input = mapBookingToMutationInput({ ...baseOptions, language: "en" });

    expect(input.language).toBe("es");
  });

  it("keeps Spanish when the browser language is already Spanish", () => {
    const input = mapBookingToMutationInput({ ...baseOptions, language: "es" });

    expect(input.language).toBe("es");
  });
});
