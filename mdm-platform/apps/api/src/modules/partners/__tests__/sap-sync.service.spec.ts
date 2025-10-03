import "reflect-metadata";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../entities/partner.entity", () => ({ Partner: class Partner {} }));
vi.mock("../entities/partner-audit-log.entity", () => ({ PartnerAuditLog: class PartnerAuditLog {} }));
vi.mock("../entities/partner-audit-job.entity", () => ({ PartnerAuditJob: class PartnerAuditJob {} }));

let SapSyncService: typeof import("../sap-sync.service").SapSyncService;

beforeAll(async () => {
  ({ SapSyncService } = await import("../sap-sync.service"));
});

const originalEnv = {
  SAP_BASE_URL: process.env.SAP_BASE_URL,
  SAP_USER: process.env.SAP_USER,
  SAP_PASSWORD: process.env.SAP_PASSWORD,
  SAP_SYNC_ENABLED: process.env.SAP_SYNC_ENABLED,
  SAP_REQUEST_TIMEOUT: process.env.SAP_REQUEST_TIMEOUT
};

const mockResponse = (body: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body)
});

type PartnerEntity = {
  id: string;
  mdmPartnerId: number;
  sapBusinessPartnerId: string | null;
  tipo_pessoa: "PJ" | "PF";
  natureza: "cliente" | "fornecedor" | "ambos";
  status: string;
  nome_legal: string;
  nome_fantasia?: string | null;
  documento: string;
  contato_principal: any;
  comunicacao: any;
  addresses: any[];
  banks: any[];
  fornecedor_info: any;
  vendas_info: any;
  fiscal_info: any;
  transportadores: any[];
  credito_info: any;
  sap_segments: any[];
};

class FakePartnerRepository {
  private store = new Map<string, PartnerEntity>();

  constructor(initial: PartnerEntity[]) {
    initial.forEach((partner) => this.store.set(partner.id, { ...partner }));
  }

  async findOne({ where }: { where: Partial<PartnerEntity> }): Promise<PartnerEntity | null> {
    const [field, value] = Object.entries(where)[0] ?? [];
    if (!field) return null;
    for (const partner of this.store.values()) {
      if ((partner as any)[field] === value) {
        return partner;
      }
    }
    return null;
  }

  merge(entity: PartnerEntity, updates: Partial<PartnerEntity>) {
    Object.assign(entity, updates);
    return entity;
  }

  async save(entity: PartnerEntity): Promise<PartnerEntity> {
    this.store.set(entity.id, { ...entity });
    return entity;
  }
}

class FakeAuditLogRepository {
  public entries: any[] = [];

  async save(entry: any): Promise<any> {
    this.entries.push(entry);
    return entry;
  }
}

class FakeAuditJobRepository {
  public jobs: any[] = [];

  create(data: any): any {
    return {
      id: `job-${this.jobs.length + 1}`,
      scope: data.scope ?? "massa",
      status: data.status ?? "queued",
      partnerIds: data.partnerIds ?? [],
      requestedBy: data.requestedBy,
      startedAt: data.startedAt,
      finishedAt: data.finishedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      logs: []
    };
  }

  async save(job: any): Promise<any> {
    this.jobs.push(job);
    return job;
  }

  async update(id: string, data: any): Promise<void> {
    const job = this.jobs.find((item) => item.id === id);
    if (!job) return;
    Object.assign(job, data);
    job.updatedAt = new Date();
  }
}

describe("SapSyncService", () => {
  beforeEach(() => {
    process.env.SAP_BASE_URL = "https://sap.example";
    process.env.SAP_USER = "user";
    process.env.SAP_PASSWORD = "secret";
    process.env.SAP_SYNC_ENABLED = "true";
    delete process.env.SAP_REQUEST_TIMEOUT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete (process.env as any)[key];
      } else {
        process.env[key] = value as string;
      }
    });
  });

  it("updates partners from SAP and records audit logs", async () => {
    const partner: PartnerEntity = {
      id: "partner-1",
      mdmPartnerId: 1000,
      sapBusinessPartnerId: null as any,
      tipo_pessoa: "PJ",
      natureza: "cliente",
      status: "draft",
      nome_legal: "Empresa Original",
      nome_fantasia: "Orig",
      documento: "12345678000190",
      contato_principal: { nome: "Old", email: "old@example.com" },
      comunicacao: {},
      addresses: [],
      banks: [],
      fornecedor_info: {},
      vendas_info: {},
      fiscal_info: {},
      transportadores: [],
      credito_info: {},
      sap_segments: []
    };

    const partnerRepo = new FakePartnerRepository([partner]);
    const auditLogRepo = new FakeAuditLogRepository();
    const auditJobRepo = new FakeAuditJobRepository();

    const service = new SapSyncService(
      partnerRepo as any,
      auditLogRepo as any,
      auditJobRepo as any
    );

    const payloadPage = {
      items: [
        {
          partnerId: "partner-1",
          sapBusinessPartnerId: "BP-500",
          legalName: "Empresa Atualizada",
          contact: { name: "Novo", email: "novo@example.com", phone: "55110000" },
          banks: [{ banco: "001", agencia: "1234", conta: "56789" }],
          sapSegments: [{ segment: "businessPartner", status: "success", sapId: "BP-500" }]
        }
      ],
      pagination: { page: 1, totalPages: 1 }
    };

    const fetchMock = vi.fn().mockResolvedValue(mockResponse(payloadPage));
    vi.stubGlobal("fetch", fetchMock);

    const summary = await service.syncPartners();

    expect(summary.fetched).toBe(1);
    expect(summary.updated).toBe(1);
    expect(summary.errors).toBe(0);

    const stored = await partnerRepo.findOne({ where: { id: "partner-1" } });
    expect(stored?.sapBusinessPartnerId).toBe("BP-500");
    expect(stored?.nome_legal).toBe("Empresa Atualizada");
    expect(stored?.banks).toEqual([{ banco: "001", agencia: "1234", conta: "56789" }]);
    expect(stored?.sap_segments).toEqual([
      { segment: "businessPartner", status: "success", sapId: "BP-500" }
    ]);

    expect(auditJobRepo.jobs.length).toBe(1);
    expect(auditLogRepo.entries).toHaveLength(1);
    expect(auditLogRepo.entries[0]).toMatchObject({
      partnerId: "partner-1",
      message: expect.stringContaining("SAP"),
      differences: expect.any(Array)
    });
  });
});

