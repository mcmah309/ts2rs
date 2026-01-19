import { expect, test, describe, it } from "bun:test";

describe("Math Utils", () => {
  test("adds two numbers correctly", () => {
    const result = 2 + 3;
    expect(result).toBe(5);
  });

  it("handles negative numbers", () => {
    expect(-1 + -1).toBe(-2);
  });
});