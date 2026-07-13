import { describe, expect, it } from "vitest";
import { parseSpotSpec } from "@/lib/spot-spec";
import { ApiError } from "@/lib/errors";

/** Run `fn`, assert it threw an ApiError, and return it for further checks. */
function expectApiError(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  }
  throw new Error("Expected parseSpotSpec to throw, but it returned.");
}

describe("parseSpotSpec", () => {
  it("parses a simple comma-separated list", () => {
    expect(parseSpotSpec("1,2,3")).toEqual(["1", "2", "3"]);
  });

  it("expands numeric ranges", () => {
    expect(parseSpotSpec("1-5")).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("allows whitespace around tokens and range dashes", () => {
    expect(parseSpotSpec("  1 - 3 ,  7 ")).toEqual(["1", "2", "3", "7"]);
  });

  it("accepts newlines and semicolons as separators", () => {
    expect(parseSpotSpec("1\n2;3,4")).toEqual(["1", "2", "3", "4"]);
  });

  it("mixes ranges, single numbers and alphanumeric labels", () => {
    expect(parseSpotSpec("1-3, 5, A1, B-2")).toEqual([
      "1",
      "2",
      "3",
      "5",
      "A1",
      "B-2",
    ]);
  });

  it("keeps alphanumeric labels verbatim (letter ranges do not expand)", () => {
    // "A1-A5" is not a numeric range, so it is a single label.
    expect(parseSpotSpec("A1-A5")).toEqual(["A1-A5"]);
    expect(parseSpotSpec("spot_9")).toEqual(["spot_9"]);
  });

  it("normalizes leading zeros in numeric ranges", () => {
    expect(parseSpotSpec("01-03")).toEqual(["1", "2", "3"]);
  });

  it("dedupes across tokens and overlapping ranges, preserving first-seen order", () => {
    expect(parseSpotSpec("3, 1-4, 2")).toEqual(["3", "1", "2", "4"]);
    expect(parseSpotSpec("A1, A1, a1")).toEqual(["A1", "a1"]);
  });

  it("ignores empty tokens between separators", () => {
    expect(parseSpotSpec("1,,2, ,3")).toEqual(["1", "2", "3"]);
  });

  it("rejects reversed ranges", () => {
    const err = expectApiError(() => parseSpotSpec("5-1"));
    expect(err.message).toContain('Invalid range "5-1"');
  });

  it("rejects ranges spanning more than 500 spots", () => {
    const err = expectApiError(() => parseSpotSpec("1-600"));
    expect(err.message).toContain("too large");
  });

  it("rejects labels longer than 10 characters", () => {
    const err = expectApiError(() => parseSpotSpec("ABCDEFGHIJK"));
    expect(err.message).toContain("too long");
  });

  it("rejects labels with illegal characters", () => {
    expectApiError(() => parseSpotSpec("A#3"));
    expectApiError(() => parseSpotSpec("A 3")); // inner space is not a separator
    expectApiError(() => parseSpotSpec("spot!"));
  });

  it("rejects an empty spec", () => {
    const err = expectApiError(() => parseSpotSpec(""));
    expect(err.message).toContain("No spot numbers");
    expectApiError(() => parseSpotSpec("  ,  ,\n; "));
  });

  it("rejects specs producing more than 1000 spots", () => {
    const err = expectApiError(() => parseSpotSpec("1-500, 501-1000, 1001"));
    expect(err.message).toContain("Too many spots");
  });

  it("throws ApiError with .status 400 (badRequest)", () => {
    const err = expectApiError(() => parseSpotSpec("9-2"));
    expect(err.status).toBe(400);
    expect(err.name).toBe("ApiError");
  });
});
