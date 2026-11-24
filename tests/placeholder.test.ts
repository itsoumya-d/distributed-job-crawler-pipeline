import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index.js";

describe("base", () => {
  it("exports version", () => {
    expect(VERSION).toBe("1.0.0");
  });
});
