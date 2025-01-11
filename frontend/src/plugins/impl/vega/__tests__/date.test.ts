/* Copyright 2024 Marimo. All rights reserved. */
import { describe, it, expect } from "vitest";
import { isDate } from "date-fns";

describe("isDate", () => {
  it("should return true for Date objects", () => {
    expect(isDate(new Date())).toBe(true);
    expect(isDate(new Date("2024-01-01T00:00:00Z"))).toBe(true);
  });

  it("should return true for ISO timestamp strings", () => {
    expect(isDate("2024-01-01T00:00:00Z")).toBe(true);
    expect(isDate("2024-01-01T00:00:00.000Z")).toBe(true);
  });

  it("should return false for invalid ISO timestamp strings", () => {
    expect(isDate("2024-01-01")).toBe(false);
    expect(isDate("2024-01-01T00:00:00")).toBe(false);
    expect(isDate("invalid-date")).toBe(false);
  });

  it("should return false for non-date objects", () => {
    expect(isDate({})).toBe(false);
    expect(isDate([])).toBe(false);
    expect(isDate(null)).toBe(false);
    expect(isDate(undefined)).toBe(false);
    expect(isDate(123)).toBe(false);
    expect(isDate("string")).toBe(false);
    expect(isDate("time-1")).toBe(false);
  });

  it("should return true for various valid date strings", () => {
    expect(isDate("2024-01-01T00:00:00Z")).toBe(true);
    expect(isDate("2024-01-01T00:00:00.000Z")).toBe(true);
    expect(isDate("2024-01-01T00:00:00+00:00")).toBe(true);
    expect(isDate("2024-01-01T00:00:00-00:00")).toBe(true);
    expect(isDate("2024-01-01T00:00:00.000+00:00")).toBe(true);
    expect(isDate("2024-01-01T00:00:00.000-00:00")).toBe(true);
  });

  it("should return false for various invalid date strings", () => {
    expect(isDate("2024-01-01T00:00:00.Z")).toBe(false);
    expect(isDate("2024-01-01T00:00:00.000+00")).toBe(false);
    expect(isDate("2024-01-01T00:00:00.000-00")).toBe(false);
    expect(isDate("2024-01-01T00:00:00+00")).toBe(false);
    expect(isDate("2024-01-01T00:00:00-00")).toBe(false);
    expect(isDate("2024-01-01T00:00:00.000Z+00:00")).toBe(false);
  });

  it("should return true for various valid non-ISO date strings", () => {
    expect(isDate("01/01/2024")).toBe(true);
    expect(isDate("01-01-2024")).toBe(true);
    expect(isDate("01.01.2024")).toBe(true);
    expect(isDate("2024/01/01")).toBe(true);
    expect(isDate("2024-01-01")).toBe(true);
  });

  it("should return false for various invalid non-ISO date strings", () => {
    expect(isDate("32/01/2024")).toBe(false);
    expect(isDate("01/13/2024")).toBe(false);
    expect(isDate("01-01-24")).toBe(false);
    expect(isDate("2024/01/32")).toBe(false);
    expect(isDate("2024-13-01")).toBe(false);
  });
});
