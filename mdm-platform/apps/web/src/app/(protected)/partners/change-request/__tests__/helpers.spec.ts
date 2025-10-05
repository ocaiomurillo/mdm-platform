import { describe, expect, it } from "vitest";
import {
  buildEmptyFieldErrors,
  buildEmptyFieldState,
  convertToInputValue,
  formatValueForDisplay,
  normalizeValue,
  parseBulkInput
} from "../page";

import { changeRequestFieldDefinitions, ChangeRequestFieldId } from "@mdm/types";

describe("change request helpers", () => {
  it("should build empty field state with all fields disabled", () => {
    const state = buildEmptyFieldState();
    changeRequestFieldDefinitions.forEach((definition) => {
      expect(state).toHaveProperty(definition.id);
      const entry = state[definition.id as ChangeRequestFieldId];
      expect(entry.enabled).toBe(false);
      expect(entry.value).toBe("");
    });
  });

  it("should build empty field errors with null entries", () => {
    const errors = buildEmptyFieldErrors();
    changeRequestFieldDefinitions.forEach((definition) => {
      expect(errors).toHaveProperty(definition.id);
      expect(errors[definition.id as ChangeRequestFieldId]).toBeNull();
    });
  });

  it("should normalize numeric and textual values", () => {
    expect(normalizeValue("nome_legal", "  ACME  ")).toBe("ACME");
    expect(normalizeValue("credito_info.montante", "  1234  ")).toBe(1234);
    expect(normalizeValue("credito_info.montante", "ABC")).toBe("ABC");
  });

  it("should parse bulk input consolidating ids", () => {
    const ids = parseBulkInput("a, b\n c  a", "z");
    expect(ids).toEqual(["z", "a", "b", "c"]);
  });

  it("should convert values to input strings", () => {
    expect(convertToInputValue("test")).toBe("test");
    expect(convertToInputValue(10)).toBe("10");
    expect(convertToInputValue({ a: 1 })).toBe(JSON.stringify({ a: 1 }));
  });

  it("should format values for display", () => {
    expect(formatValueForDisplay(" ")).toBe("—");
    expect(formatValueForDisplay(15)).toBe("15");
    expect(formatValueForDisplay(["A", "B"]).includes("A")).toBe(true);
  });
});
