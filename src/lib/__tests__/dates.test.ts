import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BOOKING_HORIZON_BUSINESS_DAYS,
  addDays,
  compareDates,
  formatDateHuman,
  formatDateLong,
  getBookableDates,
  isBookableDate,
  isPrebookDay,
  isValidISODate,
  isWeekend,
  isoWeekday,
  nextBusinessDay,
  parsePrebookDays,
  relativeDayLabel,
  todayInOfficeTz,
  weekdayShortName,
} from "@/lib/dates";

// All expectations below assume the office timezone is Europe/Warsaw
// (UTC+2 in July — CEST; UTC+1 in December — CET).
//
// Calendar facts used throughout (July 2026):
//   Mon 13, Tue 14, Wed 15, Thu 16, Fri 17, Sat 18, Sun 19, Mon 20, Tue 21
//   Fri 31 Jul → Mon 3 Aug is the next business day
//   Thu 31 Dec 2026 → Fri 1 Jan 2027 → Mon 4 Jan 2027

const ORIGINAL_TZ = process.env.OFFICE_TIMEZONE;

beforeAll(() => {
  process.env.OFFICE_TIMEZONE = "Europe/Warsaw";
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) {
    delete process.env.OFFICE_TIMEZONE;
  } else {
    process.env.OFFICE_TIMEZONE = ORIGINAL_TZ;
  }
});

describe("todayInOfficeTz", () => {
  it("returns the office-local calendar day for a midday instant", () => {
    expect(todayInOfficeTz(new Date("2026-07-16T10:00:00Z"))).toBe("2026-07-16");
  });

  it("rolls over at office midnight, not UTC midnight (22:30Z is already the next day in CEST)", () => {
    // 2026-07-13T22:30:00Z = 00:30 on Tue 14 Jul in Warsaw (UTC+2).
    expect(todayInOfficeTz(new Date("2026-07-13T22:30:00Z"))).toBe("2026-07-14");
  });

  it("stays on the same day just before office midnight", () => {
    // 2026-07-13T21:59:00Z = 23:59 on Mon 13 Jul in Warsaw.
    expect(todayInOfficeTz(new Date("2026-07-13T21:59:00Z"))).toBe("2026-07-13");
  });

  it("handles the winter offset (CET, UTC+1) across a year boundary", () => {
    // 2026-12-31T23:30:00Z = 00:30 on Fri 1 Jan 2027 in Warsaw.
    expect(todayInOfficeTz(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    // 2026-12-31T22:30:00Z = 23:30 on Thu 31 Dec 2026 in Warsaw.
    expect(todayInOfficeTz(new Date("2026-12-31T22:30:00Z"))).toBe("2026-12-31");
  });
});

describe("getBookableDates", () => {
  it("exports a 2-business-day horizon", () => {
    expect(BOOKING_HORIZON_BUSINESS_DAYS).toBe(2);
  });

  it("Monday → [Mon, Tue, Wed]", () => {
    expect(getBookableDates(new Date("2026-07-13T10:00:00Z"))).toEqual([
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
    ]);
  });

  it("Thursday → [Thu, Fri, Mon] (skips the weekend)", () => {
    expect(getBookableDates(new Date("2026-07-16T10:00:00Z"))).toEqual([
      "2026-07-16",
      "2026-07-17",
      "2026-07-20",
    ]);
  });

  it("Friday → [Fri, Mon, Tue]", () => {
    expect(getBookableDates(new Date("2026-07-17T10:00:00Z"))).toEqual([
      "2026-07-17",
      "2026-07-20",
      "2026-07-21",
    ]);
  });

  it("Saturday → [Mon, Tue] (today itself is never bookable on a weekend)", () => {
    expect(getBookableDates(new Date("2026-07-18T10:00:00Z"))).toEqual([
      "2026-07-20",
      "2026-07-21",
    ]);
  });

  it("Sunday → [Mon, Tue]", () => {
    expect(getBookableDates(new Date("2026-07-19T10:00:00Z"))).toEqual([
      "2026-07-20",
      "2026-07-21",
    ]);
  });

  it("crosses a month boundary (Fri 31 Jul → Mon 3 Aug, Tue 4 Aug)", () => {
    expect(getBookableDates(new Date("2026-07-31T10:00:00Z"))).toEqual([
      "2026-07-31",
      "2026-08-03",
      "2026-08-04",
    ]);
  });

  it("crosses a year boundary (Thu 31 Dec 2026 → Fri 1 Jan → Mon 4 Jan 2027)", () => {
    expect(getBookableDates(new Date("2026-12-31T10:00:00Z"))).toEqual([
      "2026-12-31",
      "2027-01-01",
      "2027-01-04",
    ]);
  });

  it("uses the office-local day near midnight: 2026-07-13T22:30Z is already Tue 14 Jul in Warsaw", () => {
    expect(getBookableDates(new Date("2026-07-13T22:30:00Z"))).toEqual([
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
    ]);
  });

  it("Friday 22:30Z is already Saturday in Warsaw → weekend window [Mon, Tue]", () => {
    expect(getBookableDates(new Date("2026-07-17T22:30:00Z"))).toEqual([
      "2026-07-20",
      "2026-07-21",
    ]);
  });
});

describe("isBookableDate", () => {
  const MONDAY = new Date("2026-07-13T10:00:00Z");

  it("accepts every date in the current window", () => {
    expect(isBookableDate("2026-07-13", MONDAY)).toBe(true);
    expect(isBookableDate("2026-07-14", MONDAY)).toBe(true);
    expect(isBookableDate("2026-07-15", MONDAY)).toBe(true);
  });

  it("rejects past days, weekends, and days beyond the horizon", () => {
    expect(isBookableDate("2026-07-10", MONDAY)).toBe(false); // past Friday
    expect(isBookableDate("2026-07-16", MONDAY)).toBe(false); // beyond horizon
    expect(isBookableDate("2026-07-18", MONDAY)).toBe(false); // Saturday
    expect(isBookableDate("2026-07-19", MONDAY)).toBe(false); // Sunday
  });
});

describe("isoWeekday", () => {
  it("maps Monday to 1 and Sunday to 7", () => {
    expect(isoWeekday("2026-07-13")).toBe(1); // Mon
    expect(isoWeekday("2026-07-14")).toBe(2); // Tue
    expect(isoWeekday("2026-07-15")).toBe(3); // Wed
    expect(isoWeekday("2026-07-16")).toBe(4); // Thu
    expect(isoWeekday("2026-07-17")).toBe(5); // Fri
    expect(isoWeekday("2026-07-18")).toBe(6); // Sat
    expect(isoWeekday("2026-07-19")).toBe(7); // Sun
  });
});

describe("isWeekend", () => {
  it("is false Monday through Friday", () => {
    expect(isWeekend("2026-07-13")).toBe(false);
    expect(isWeekend("2026-07-14")).toBe(false);
    expect(isWeekend("2026-07-15")).toBe(false);
    expect(isWeekend("2026-07-16")).toBe(false);
    expect(isWeekend("2026-07-17")).toBe(false);
  });

  it("is true on Saturday and Sunday", () => {
    expect(isWeekend("2026-07-18")).toBe(true);
    expect(isWeekend("2026-07-19")).toBe(true);
  });
});

describe("addDays", () => {
  it("adds within a month", () => {
    expect(addDays("2026-07-13", 1)).toBe("2026-07-14");
    expect(addDays("2026-07-13", 0)).toBe("2026-07-13");
  });

  it("crosses month boundaries in both directions", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("crosses year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles February in leap and non-leap years", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // leap year
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01"); // non-leap year
  });

  it("supports multi-day jumps", () => {
    expect(addDays("2026-07-13", 60)).toBe("2026-09-11");
    expect(addDays("2026-07-13", -14)).toBe("2026-06-29");
  });
});

describe("nextBusinessDay", () => {
  it("moves a weekday to the next weekday", () => {
    expect(nextBusinessDay("2026-07-13")).toBe("2026-07-14"); // Mon → Tue
    expect(nextBusinessDay("2026-07-16")).toBe("2026-07-17"); // Thu → Fri
  });

  it("skips the weekend from Friday, Saturday and Sunday", () => {
    expect(nextBusinessDay("2026-07-17")).toBe("2026-07-20"); // Fri → Mon
    expect(nextBusinessDay("2026-07-18")).toBe("2026-07-20"); // Sat → Mon
    expect(nextBusinessDay("2026-07-19")).toBe("2026-07-20"); // Sun → Mon
  });

  it("crosses month and year boundaries", () => {
    expect(nextBusinessDay("2026-07-31")).toBe("2026-08-03"); // Fri 31 Jul → Mon 3 Aug
    expect(nextBusinessDay("2026-12-31")).toBe("2027-01-01"); // Thu → Fri
    expect(nextBusinessDay("2027-01-01")).toBe("2027-01-04"); // Fri → Mon
  });
});

describe("compareDates", () => {
  it("orders ISO dates like numbers", () => {
    expect(compareDates("2026-07-13", "2026-07-14")).toBe(-1);
    expect(compareDates("2026-07-14", "2026-07-13")).toBe(1);
    expect(compareDates("2026-07-13", "2026-07-13")).toBe(0);
    expect(compareDates("2026-12-31", "2027-01-01")).toBe(-1);
  });
});

describe("parsePrebookDays", () => {
  it("parses the default Mon–Fri string", () => {
    expect(parsePrebookDays("1,2,3,4,5")).toEqual([1, 2, 3, 4, 5]);
  });

  it("trims whitespace, dedupes and sorts", () => {
    expect(parsePrebookDays(" 5, 1, 1 ,3")).toEqual([1, 3, 5]);
  });

  it("drops out-of-range and non-integer values", () => {
    expect(parsePrebookDays("0,1,7,8,-1")).toEqual([1, 7]);
    expect(parsePrebookDays("2.5,3")).toEqual([3]);
    expect(parsePrebookDays("abc,4")).toEqual([4]);
  });

  it("returns an empty list for an empty or garbage string", () => {
    expect(parsePrebookDays("")).toEqual([]);
    expect(parsePrebookDays("x,y,z")).toEqual([]);
  });
});

describe("isPrebookDay", () => {
  it("is true when the date's ISO weekday is listed", () => {
    expect(isPrebookDay("1,2,3,4,5", "2026-07-13")).toBe(true); // Mon
    expect(isPrebookDay("2,4", "2026-07-14")).toBe(true); // Tue
    expect(isPrebookDay("2,4", "2026-07-16")).toBe(true); // Thu
  });

  it("is false when the weekday is not listed", () => {
    expect(isPrebookDay("2,4", "2026-07-13")).toBe(false); // Mon
    expect(isPrebookDay("1,2,3,4,5", "2026-07-18")).toBe(false); // Sat
    expect(isPrebookDay("", "2026-07-13")).toBe(false);
  });
});

describe("isValidISODate", () => {
  it("accepts real calendar dates", () => {
    expect(isValidISODate("2026-07-13")).toBe(true);
    expect(isValidISODate("2026-01-01")).toBe(true);
    expect(isValidISODate("2026-12-31")).toBe(true);
    expect(isValidISODate("2024-02-29")).toBe(true); // leap day
  });

  it('rejects "2026-02-30" and other impossible days', () => {
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-02-29")).toBe(false); // 2026 is not a leap year
    expect(isValidISODate("2026-04-31")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("2026-00-10")).toBe(false);
    expect(isValidISODate("2026-01-32")).toBe(false);
    expect(isValidISODate("2026-01-00")).toBe(false);
  });

  it("rejects malformed strings", () => {
    expect(isValidISODate("")).toBe(false);
    expect(isValidISODate("2026-7-13")).toBe(false); // must be zero-padded
    expect(isValidISODate("13-07-2026")).toBe(false);
    expect(isValidISODate("2026/07/13")).toBe(false);
    expect(isValidISODate("2026-07-13T00:00:00Z")).toBe(false);
    expect(isValidISODate("not-a-date")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isValidISODate(null)).toBe(false);
    expect(isValidISODate(undefined)).toBe(false);
    expect(isValidISODate(20260713)).toBe(false);
    expect(isValidISODate(new Date())).toBe(false);
  });
});

describe("weekdayShortName", () => {
  it("names ISO weekdays 1–7", () => {
    expect(weekdayShortName(1)).toBe("Mon");
    expect(weekdayShortName(5)).toBe("Fri");
    expect(weekdayShortName(6)).toBe("Sat");
    expect(weekdayShortName(7)).toBe("Sun");
  });

  it('falls back to "?" outside 1–7', () => {
    expect(weekdayShortName(0)).toBe("?");
    expect(weekdayShortName(8)).toBe("?");
  });
});

describe("formatting helpers", () => {
  it("formatDateHuman renders the Y-M-D parts timezone-independently", () => {
    expect(formatDateHuman("2026-07-14")).toMatch(/^Tue,?\s14\sJul$/);
  });

  it("formatDateLong renders the full date", () => {
    expect(formatDateLong("2026-07-14")).toMatch(/^Tuesday,?\s14\sJuly\s2026$/);
  });

  it("relativeDayLabel says Today / Tomorrow relative to the office day", () => {
    const MONDAY = new Date("2026-07-13T10:00:00Z");
    expect(relativeDayLabel("2026-07-13", MONDAY)).toBe("Today");
    expect(relativeDayLabel("2026-07-14", MONDAY)).toBe("Tomorrow");
    expect(relativeDayLabel("2026-07-15", MONDAY)).toBe(
      formatDateHuman("2026-07-15")
    );
  });

  it("relativeDayLabel respects the office timezone near midnight", () => {
    // 22:30Z on Mon 13 Jul is already Tue 14 Jul in Warsaw.
    const LATE = new Date("2026-07-13T22:30:00Z");
    expect(relativeDayLabel("2026-07-14", LATE)).toBe("Today");
    expect(relativeDayLabel("2026-07-15", LATE)).toBe("Tomorrow");
  });
});
