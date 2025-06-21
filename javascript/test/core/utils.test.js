import { describe, it, expect } from "vitest";
import { isNumeric, tryConvertToNumber } from "../../src/index.js";

describe("isNumeric", () => {
  it("should identify numeric strings", () => {
    expect(isNumeric("123")).toBe(true);
    expect(isNumeric("12.34")).toBe(true);
    expect(isNumeric("-5")).toBe(true);
    expect(isNumeric("0")).toBe(true);
    expect(isNumeric("0.0")).toBe(true);
  });

  it("should reject non-numeric strings", () => {
    expect(isNumeric("hello")).toBe(false);
    expect(isNumeric("")).toBe(false);
    expect(isNumeric("12abc")).toBe(false);
    expect(isNumeric("abc12")).toBe(false);
  });

  it("should reject non-string types", () => {
    expect(isNumeric(123)).toBe(false);
    expect(isNumeric(null)).toBe(false);
    expect(isNumeric(undefined)).toBe(false);
    expect(isNumeric([])).toBe(false);
    expect(isNumeric({})).toBe(false);
  });
});

describe("tryConvertToNumber", () => {
  it("should convert numeric strings to numbers", () => {
    expect(tryConvertToNumber("123")).toBe(123);
    expect(tryConvertToNumber("12.34")).toBe(12.34);
    expect(tryConvertToNumber("-5")).toBe(-5);
    expect(tryConvertToNumber("0")).toBe(0);
  });

  it("should keep non-numeric strings as strings", () => {
    expect(tryConvertToNumber("hello")).toBe("hello");
    expect(tryConvertToNumber("abc123")).toBe("abc123");
  });

  it("should handle empty string", () => {
    expect(tryConvertToNumber("")).toBe("");
  });

  it("should return non-strings unchanged", () => {
    expect(tryConvertToNumber(123)).toBe(123);
    expect(tryConvertToNumber(null)).toBeNull();
    expect(tryConvertToNumber(undefined)).toBeUndefined();

    const obj = {};
    expect(tryConvertToNumber(obj)).toBe(obj);
  });
});
