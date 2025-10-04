import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { CreatePartnerDto } from "../dto/create-partner.dto";
import { PartnersService } from "../partners.service";

vi.mock("../entities/partner.entity", () => ({ Partner: class {} }));
vi.mock("../entities/partner-change-request.entity", () => ({ PartnerChangeRequest: class {} }));
vi.mock("../entities/partner-audit-job.entity", () => ({ PartnerAuditJob: class {} }));
vi.mock("../entities/partner-audit-log.entity", () => ({ PartnerAuditLog: class {} }));
vi.mock("../entities/partner-note.entity", () => ({ PartnerNote: class {} }));

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

describe("CreatePartnerDto validation", () => {
  it("accepts valid CNPJ document", async () => {
    const instance = plainToInstance(CreatePartnerDto, basePayload);
    const result = await validate(instance);
    expect(result).toHaveLength(0);
  });

  it("rejects invalid CNPJ document", async () => {
    const instance = plainToInstance(CreatePartnerDto, { ...basePayload, documento: "45.723.174/0001-11" });
    const result = await validate(instance);
    expect(result.some((item) => item.property === "documento")).toBe(true);
  });

  it("rejects invalid CPF when pessoa física", async () => {
    const instance = plainToInstance(CreatePartnerDto, {
      ...basePayload,
      tipo_pessoa: "PF" as const,
      documento: "39053344704",
      contato_principal: {
        nome: "Ciclana",
        email: "ciclana@example.com"
      }
    });
    const result = await validate(instance);
    expect(result.some((item) => item.property === "documento")).toBe(true);
  });

  it("validates inscrição estadual when provided", async () => {
    const instance = plainToInstance(CreatePartnerDto, { ...basePayload, ie: "ISENTO" });
    const result = await validate(instance);
    expect(result).toHaveLength(0);

    const invalid = plainToInstance(CreatePartnerDto, { ...basePayload, ie: "11" });
    const invalidResult = await validate(invalid);
    expect(invalidResult.some((item) => item.property === "ie")).toBe(true);
  });
});

describe("PartnersService lookup", () => {
  const repo = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn()
  };

  const changeRepo = { find: vi.fn(), save: vi.fn() };
  const auditJobRepo = { findOne: vi.fn(), update: vi.fn() };
  const auditLogRepo = { save: vi.fn() };
  const noteRepo = { find: vi.fn(), create: vi.fn(), save: vi.fn() };
  const sapIntegration = {
    integratePartner: vi.fn().mockResolvedValue({ segments: [], completed: true, updates: {} }),
    retry: vi.fn().mockResolvedValue({ segments: [], completed: true, updates: {} }),
    markSegmentsAsError: vi.fn().mockReturnValue([])
  };

  let service: InstanceType<typeof PartnersService>;

  beforeEach(() => {
    vi.restoreAllMocks();
    repo.findOne.mockReset();
    noteRepo.find.mockReset();
    noteRepo.create.mockReset();
    noteRepo.save.mockReset();
    sapIntegration.integratePartner.mockReset();
    sapIntegration.retry.mockReset();
    sapIntegration.markSegmentsAsError.mockClear();
    service = new PartnersService(
      repo as any,
      changeRepo as any,
      auditJobRepo as any,
      auditLogRepo as any,
      noteRepo as any,
      sapIntegration as any
    );
  });

  it("rejects invalid CPF", async () => {
    await expect(service.lookupCpf("123"))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects CPF duplicates", async () => {
    repo.findOne.mockResolvedValueOnce({ id: "1" });
    await expect(service.lookupCpf("39053344705"))
      .rejects.toThrow("CPF ja cadastrado");
  });

  it("returns normalized CPF data", async () => {
    repo.findOne.mockResolvedValueOnce(null);
    const result = await service.lookupCpf("390.533.447-05");
    expect(result.documento).toBe("39053344705");
  });

  it("rejects invalid CNPJ", async () => {
    await expect(service.lookupCnpj("12.345.678/0001-00"))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects CNPJ duplicates", async () => {
    repo.findOne.mockResolvedValueOnce({ id: "1" });
    await expect(service.lookupCnpj("45.723.174/0001-10"))
      .rejects.toThrow("CNPJ ja cadastrado");
  });

  it("returns normalized CNPJ data", async () => {
    repo.findOne.mockResolvedValueOnce(null);
    const payload = {
      cnpj: "45723174000110",
      razao_social: "Empresa Teste",
      establishment_principal: {
        endereco: {
          cep: "01001-000",
          logradouro: "Rua Teste",
          numero: "123",
          bairro: "Centro",
          municipio: "São Paulo",
          uf: "SP"
        }
      }
    };
    const spy = vi
      .spyOn(service as any, "fetchFromCnpja")
      .mockResolvedValueOnce(payload);

    const result = await service.lookupCnpj("45.723.174/0001-10");
    expect(result.documento).toBe("45723174000110");
    expect(spy).toHaveBeenCalled();
  });
});
