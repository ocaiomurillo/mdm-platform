import "reflect-metadata";

import { ValidationPipe, BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { CreatePartnerDto } from "./modules/partners/dto/create-partner.dto";

const basePayload = {
  tipo_pessoa: "PJ" as const,
  natureza: "cliente" as const,
  nome_legal: "Empresa Teste",
  documento: "45.723.174/0001-10",
  contato_principal: {
    nome: "Fulano de Tal",
    email: "fulano@example.com"
  },
  comunicacao: {
    emails: [{ endereco: "contato@example.com" }]
  },
  addresses: [
    {
      cep: "01001-000",
      logradouro: "Rua Teste",
      numero: "123",
      bairro: "Centro",
      municipio: "São Paulo",
      uf: "SP"
    }
  ]
};

describe("Global ValidationPipe configuration", () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  it("strips unknown fields from request bodies", async () => {
    const result = await pipe.transform(
      {
        ...basePayload,
        extraneous: "value"
      },
      { type: "body", metatype: CreatePartnerDto }
    );

    expect(result).not.toHaveProperty("extraneous");
  });

  it("returns validation messages for invalid payloads", async () => {
    try {
      await pipe.transform(
        {
          ...basePayload,
          documento: "45.723.174/0001-11"
        },
        { type: "body", metatype: CreatePartnerDto }
      );
      throw new Error("expected validation error");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message?: string[];
      };
      expect(response?.message).toEqual(
        expect.arrayContaining([expect.stringContaining("CNPJ inválido")])
      );
    }
  });
});
