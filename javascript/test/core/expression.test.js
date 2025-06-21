import { describe, it, expect } from "vitest";
import {
  Expression,
  Key,
  FlyqlError,
  VALID_KEY_VALUE_OPERATORS,
} from "../../src/index.js";

describe("Expression", () => {
  it("should create valid expressions with all operators", () => {
    VALID_KEY_VALUE_OPERATORS.forEach((operator) => {
      const key = new Key(["key"]);
      const expr = new Expression(key, operator, "value", null);
      expect(expr.toString()).toBe(`key${operator}value`);
    });
  });

  it("should throw error for invalid operator", () => {
    const key = new Key(["key"]);
    expect(
      () => new Expression(key, "invalid_operator", "value", null),
    ).toThrow(FlyqlError);
  });

  it("should throw error for empty key", () => {
    const key = new Key([]);
    expect(() => new Expression(key, "=", "value", null)).toThrow(FlyqlError);
  });

  it("should allow empty value", () => {
    const key = new Key(["key"]);
    const expr = new Expression(key, "=", "", null);
    expect(expr.value).toBe("");
  });

  it("should handle string values explicitly", () => {
    const key = new Key(["name"]);
    const expr = new Expression(key, "=", "test", true);
    expect(expr.value).toBe("test");
    expect(typeof expr.value).toBe("string");
  });

  it("should convert numeric values when valueIsString is false", () => {
    const key1 = new Key(["count"]);
    const expr1 = new Expression(key1, "=", "123", false);
    expect(expr1.value).toBe(123);
    expect(typeof expr1.value).toBe("number");

    const key2 = new Key(["price"]);
    const expr2 = new Expression(key2, "=", "12.34", false);
    expect(expr2.value).toBe(12.34);
    expect(typeof expr2.value).toBe("number");
  });

  it("should keep non-numeric values as strings when valueIsString is false", () => {
    const key = new Key(["name"]);
    const expr = new Expression(key, "=", "abc", false);
    expect(expr.value).toBe("abc");
    expect(typeof expr.value).toBe("string");
  });

  it("should auto-convert when valueIsString is null", () => {
    const key1 = new Key(["count"]);
    const expr1 = new Expression(key1, "=", "123", null);
    expect(expr1.value).toBe(123);
    expect(typeof expr1.value).toBe("number");

    const key2 = new Key(["name"]);
    const expr2 = new Expression(key2, "=", "abc", null);
    expect(expr2.value).toBe("abc");
    expect(typeof expr2.value).toBe("string");
  });
});
