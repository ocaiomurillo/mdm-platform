import { registerDecorator, ValidationArguments, ValidationOptions } from "class-validator";
import {
  validateCEP,
  validateCNPJ,
  validateCPF,
  validateIbgeCode,
  validateIE
} from "@mdm/utils";

type StateRegistrationOptions = ValidationOptions & { allowIsento?: boolean };

const isEmpty = (value: unknown) => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim().length === 0) return true;
  return false;
};

type SimpleDecoratorOptions = {
  name: string;
  validate: (value: string, args: ValidationArguments) => boolean;
  defaultMessage: string | ((args: ValidationArguments) => string);
};

const createSimpleDecorator = ({ name, validate, defaultMessage }: SimpleDecoratorOptions) => {
  return (validationOptions?: ValidationOptions) => {
    return (object: object, propertyName: string) => {
      registerDecorator({
        name,
        target: object.constructor,
        propertyName,
        options: validationOptions,
        validator: {
          validate(value: unknown, args: ValidationArguments) {
            if (isEmpty(value)) return true;
            return validate(String(value), args);
          },
          defaultMessage(args: ValidationArguments) {
            if (typeof defaultMessage === "function") {
              return defaultMessage(args);
            }
            return defaultMessage;
          }
        }
      });
    };
  };
};

export const IsCpf = createSimpleDecorator({
  name: "isCpf",
  validate: (value) => validateCPF(value),
  defaultMessage: "CPF inválido"
});

export const IsCnpj = createSimpleDecorator({
  name: "isCnpj",
  validate: (value) => validateCNPJ(value),
  defaultMessage: "CNPJ inválido"
});

export const IsCep = createSimpleDecorator({
  name: "isCep",
  validate: (value) => validateCEP(value),
  defaultMessage: "CEP inválido"
});

export const IsIbgeCode = createSimpleDecorator({
  name: "isIbgeCode",
  validate: (value) => validateIbgeCode(value),
  defaultMessage: "Código IBGE inválido"
});

export const IsStateRegistration = (options?: StateRegistrationOptions) => {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: "isStateRegistration",
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (isEmpty(value)) return true;
          return validateIE(String(value), { allowIsento: options?.allowIsento });
        },
        defaultMessage: () => options?.message ?? "Inscrição estadual inválida"
      }
    });
  };
};
