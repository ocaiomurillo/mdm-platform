import { describe, expect, it } from "vitest";
import {
  isCNPJ,
  isCPF,
  onlyDigits,
  validateCEP,
  validateCNPJ,
  validateCPF,
  validateIbgeCode,
  validateIE
} from "./index";

describe("onlyDigits", () => {
  it("removes non digit characters", () => {
    expect(onlyDigits("12.345-67"))
      .toBe("1234567");
  });
});

describe("CPF validation", () => {
  it("returns true for valid CPF", () => {
    expect(validateCPF("390.533.447-05")).toBe(true);
    expect(isCPF("39053344705")).toBe(true);
  });

  it("returns false for invalid CPF", () => {
    expect(validateCPF("390.533.447-04")).toBe(false);
    expect(validateCPF("11111111111")).toBe(false);
    expect(isCPF("123"))
      .toBe(false);
  });
});

describe("CNPJ validation", () => {
  it("returns true for valid CNPJ", () => {
    expect(validateCNPJ("45.723.174/0001-10")).toBe(true);
    expect(isCNPJ("45723174000110")).toBe(true);
  });

  it("returns false for invalid CNPJ", () => {
    expect(validateCNPJ("45.723.174/0001-11")).toBe(false);
    expect(validateCNPJ("00.000.000/0000-00")).toBe(false);
    expect(isCNPJ("123"))
      .toBe(false);
  });
});

describe("CEP validation", () => {
  it("validates valid CEP", () => {
    expect(validateCEP("01001-000")).toBe(true);
  });

  it("rejects invalid CEP", () => {
    expect(validateCEP("12345"))
      .toBe(false);
    expect(validateCEP("00000000"))
      .toBe(false);
  });
});

describe("IBGE code validation", () => {
  it("validates 7 digit codes", () => {
    expect(validateIbgeCode("3550308")).toBe(true);
  });

  it("rejects invalid codes", () => {
    expect(validateIbgeCode("123"))
      .toBe(false);
    expect(validateIbgeCode("1111111"))
      .toBe(false);
  });
});

describe("IE validation", () => {
  it("accepts sanitized IE", () => {
    expect(validateIE("123.456.789.012")).toBe(true);
  });

  it("accepts ISENTO when allowed", () => {
    expect(validateIE("isento", { allowIsento: true })).toBe(true);
  });

  it("rejects invalid IE", () => {
    expect(validateIE("", { allowIsento: true }))
      .toBe(false);
    expect(validateIE("11"))
      .toBe(false);
  });
});
