import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../entities/partner.entity", () => ({ Partner: class {} }));
vi.mock("../entities/partner-change-request.entity", () => ({ PartnerChangeRequest: class {} }));
vi.mock("../entities/partner-audit-job.entity", () => ({ PartnerAuditJob: class {} }));
vi.mock("../entities/partner-audit-log.entity", () => ({ PartnerAuditLog: class {} }));

const { PartnersService } = await import("../partners.service");

describe("PartnersService audit processing", () => {
  const repo = {
    findOne: vi.fn()
  };
  const changeRepo = {
    find: vi.fn()
  };
  const auditJobRepo = {
    findOne: vi.fn(),
    update: vi.fn()
  };
  const auditLogRepo = {
    save: vi.fn()
  };
  const sapIntegration = {
    integratePartner: vi.fn(),
    retry: vi.fn(),
    markSegmentsAsError: vi.fn().mockReturnValue([])
  };

  let service: InstanceType<typeof PartnersService>;

  beforeEach(() => {
    vi.restoreAllMocks();
    repo.findOne.mockReset();
    changeRepo.find.mockReset();
    auditJobRepo.findOne.mockReset();
    auditJobRepo.update.mockReset();
    auditLogRepo.save.mockReset();

    sapIntegration.integratePartner.mockReset();
    sapIntegration.retry.mockReset();
    sapIntegration.markSegmentsAsError.mockClear();

    service = new PartnersService(
      repo as any,
      changeRepo as any,
      auditJobRepo as any,
      auditLogRepo as any,
      sapIntegration as any
    );
  });

  it("persists differences when external data diverges", async () => {
    const job = { id: "job-1", partnerIds: ["partner-1"] };
    auditJobRepo.findOne.mockResolvedValue(job);
    auditJobRepo.update.mockResolvedValue(undefined);

    const partner = {
      id: "partner-1",
      tipo_pessoa: "PJ",
      documento: "12.345.678/0001-99",
      nome_legal: "Empresa ABC",
      nome_fantasia: "ABC",
      regime_tributario: "Simples",
      contato_principal: { nome: "Fulano", email: "cadastro@example.com", fone: "11987654321" },
      addresses: [
        {
          cep: "04000-000",
          logradouro: "Rua Interna",
          numero: "100",
          complemento: "",
          bairro: "Centro",
          municipio: "São Paulo",
          uf: "SP"
        }
      ]
    } as any;

    repo.findOne.mockResolvedValue(partner);
    changeRepo.find.mockResolvedValue([]);

    const externalPayload = {
      cnpj: "12345678000199",
      razao_social: "Empresa XYZ",
      nome_fantasia: "XYZ",
      establishment_principal: {
        nome_fantasia: "XYZ",
        endereco: {
          cep: "04000-000",
          logradouro: "Rua Externa",
          numero: "100",
          bairro: "Centro",
          municipio: "São Paulo",
          uf: "SP"
        },
        email: "externo@example.com",
        telefone: "11911112222"
      }
    };

    const fetchSpy = vi.spyOn(service as any, "fetchFromCnpja").mockResolvedValue(externalPayload);

    await (service as any).processAuditJob(job.id);

    expect(fetchSpy).toHaveBeenCalledWith("12345678000199");
    expect(auditLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        partnerId: partner.id,
        result: "inconsistente",
        differences: expect.arrayContaining([
          expect.objectContaining({ field: "nome_legal", before: "Empresa ABC", after: "Empresa XYZ" })
        ]),
        externalData: expect.objectContaining({ source: "cnpja" })
      })
    );
  });

  it("falls back to change request payload when external source fails", async () => {
    const job = { id: "job-2", partnerIds: ["partner-2"] };
    auditJobRepo.findOne.mockResolvedValue(job);
    auditJobRepo.update.mockResolvedValue(undefined);

    const partner = {
      id: "partner-2",
      tipo_pessoa: "PJ",
      documento: "98.765.432/0001-10",
      nome_legal: "Empresa Base",
      nome_fantasia: "Base",
      contato_principal: { nome: "Beltrano", email: "base@example.com" },
      addresses: []
    } as any;

    repo.findOne.mockResolvedValue(partner);
    changeRepo.find.mockResolvedValue([
      {
        id: "cr-1",
        partnerId: partner.id,
        requestType: "individual",
        status: "pendente",
        requestedBy: "user@example.com",
        createdAt: new Date("2023-01-01T00:00:00.000Z"),
        payload: {
          partners: [
            {
              partnerId: partner.id,
              changes: [
                {
                  field: "nome_fantasia",
                  label: "Nome fantasia",
                  previousValue: "Base",
                  newValue: "Nova Marca"
                }
              ]
            }
          ]
        }
      }
    ]);

    const fetchSpy = vi.spyOn(service as any, "fetchFromCnpja").mockRejectedValue(new Error("timeout"));

    await (service as any).processAuditJob(job.id);

    expect(fetchSpy).toHaveBeenCalledWith("98765432000110");
    expect(auditLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        partnerId: partner.id,
        result: "inconsistente",
        differences: expect.arrayContaining([
          expect.objectContaining({ field: "nome_fantasia", before: "Base", after: "Nova Marca", source: "change_request" })
        ]),
        externalData: expect.objectContaining({ source: "change_request", changeRequestId: "cr-1" })
      })
    );
  });

  it("flags audit as error when no reference data is available", async () => {
    const job = { id: "job-3", partnerIds: ["partner-3"] };
    auditJobRepo.findOne.mockResolvedValue(job);
    auditJobRepo.update.mockResolvedValue(undefined);

    const partner = {
      id: "partner-3",
      tipo_pessoa: "PF",
      documento: "39053344705",
      nome_legal: "Pessoa Física",
      contato_principal: { nome: "Maria", email: "maria@example.com" },
      addresses: []
    } as any;

    repo.findOne.mockResolvedValue(partner);
    changeRepo.find.mockResolvedValue([]);

    const fetchSpy = vi.spyOn(service as any, "fetchFromCnpja");

    await (service as any).processAuditJob(job.id);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(auditLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        partnerId: partner.id,
        result: "erro",
        differences: null,
        externalData: null
      })
    );
  });
});
