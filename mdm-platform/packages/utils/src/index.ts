const repeatedDigits = (value: string) => /^(\d)\1+$/.test(value);

const calculateCpfCheckDigit = (digits: string, factor: number) => {
  const total = digits
    .split("")
    .map((digit) => Number(digit))
    .reduce((acc, digit) => {
      const result = acc + digit * factor;
      factor -= 1;
      return result;
    }, 0);

  const remainder = (total * 10) % 11;
  return remainder === 10 ? 0 : remainder;
};

const calculateCnpjCheckDigit = (digits: string, weights: number[]) => {
  const total = digits
    .split("")
    .map((digit) => Number(digit))
    .reduce((acc, digit, index) => acc + digit * weights[index], 0);

  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};

export const onlyDigits = (v: string) => (v ?? "").toString().replace(/\D+/g, "");

export const validateCPF = (value: string) => {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return false;
  if (repeatedDigits(digits)) return false;

  const base = digits.substring(0, 9);
  const checkDigit1 = calculateCpfCheckDigit(base, 10);
  const checkDigit2 = calculateCpfCheckDigit(`${base}${checkDigit1}`, 11);

  return digits.endsWith(`${checkDigit1}${checkDigit2}`);
};

export const validateCNPJ = (value: string) => {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return false;
  if (repeatedDigits(digits)) return false;

  const base = digits.substring(0, 12);
  const checkDigit1 = calculateCnpjCheckDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const checkDigit2 = calculateCnpjCheckDigit(`${base}${checkDigit1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return digits.endsWith(`${checkDigit1}${checkDigit2}`);
};

export const validateCEP = (value: string) => {
  const digits = onlyDigits(value);
  return digits.length === 8 && !repeatedDigits(digits);
};

export const validateIbgeCode = (value: string) => {
  const digits = onlyDigits(value);
  return digits.length === 7 && !repeatedDigits(digits);
};

export const validateIE = (value: string, options?: { allowIsento?: boolean }) => {
  if (typeof value !== "string") return false;
  const normalized = value.trim();

  if (!normalized) return false;
  if (options?.allowIsento && normalized.toLowerCase() === "isento") return true;

  const digits = onlyDigits(normalized);
  if (!digits.length) return false;
  if (digits.length < 2 || digits.length > 15) return false;
  if (repeatedDigits(digits)) return false;

  return true;
};

export const isCNPJ = (v: string) => validateCNPJ(v);
export const isCPF = (v: string) => validateCPF(v);
