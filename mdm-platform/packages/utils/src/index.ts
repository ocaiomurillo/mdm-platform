export const onlyDigits = (v: string) => v.replace(/\D+/g, "");
export const isCNPJ = (v: string) => onlyDigits(v).length === 14; // TODO: validar dÃ­gitos
export const isCPF  = (v: string) => onlyDigits(v).length === 11; // TODO: validar dÃ­gitos
