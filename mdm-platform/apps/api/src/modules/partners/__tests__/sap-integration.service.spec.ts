import "reflect-metadata";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SapIntegrationService } from "../sap-integration.service";
import { Partner } from "../entities/partner.entity";

const originalEnv = {
  SAP_SYNC_ENABLED: process.env.SAP_SYNC_ENABLED,
  SAP_BASE_URL: process.env.SAP_BASE_URL,
  SAP_USER: process.env.SAP_USER,
  SAP_PASSWORD: process.env.SAP_PASSWORD,
  SAP_REQUEST_TIMEOUT: process.env.SAP_REQUEST_TIMEOUT
};

const createPartner = (overrides: Partial<Partner> = {}): Partner =>
  ({
    id: "partner-1",
    mdmPartnerId: 1000,
    sapBusinessPartnerId: overrides.sapBusinessPartnerId ?? null,
    documento: "12345678901234",
    nome_legal: "Empresa Teste",
    nome_fantasia: "Empresa",
    tipo_pessoa: "PJ",
    natureza: "cliente",
    contato_principal: { nome: "Fulano", email: "fulano@example.com" },
    fiscal_info: {},
    addresses: [],
    banks: [],
    transportadores: [],
    sap_segments: [],
    ...overrides
  } as Partner);

const mockFetchResponse = (body: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => {
    if (body === undefined || body === null) return "";
    return typeof body === "string" ? body : JSON.stringify(body);
  }
});

beforeEach(() => {
  process.env.SAP_SYNC_ENABLED = "true";
  delete process.env.SAP_BASE_URL;
  delete process.env.SAP_USER;
  delete process.env.SAP_PASSWORD;
  delete process.env.SAP_REQUEST_TIMEOUT;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(() => {
  Object.entries(originalEnv).forEach(([key, value]) => {
    if (value === undefined) {
      delete (process.env as any)[key];
    } else {
      process.env[key] = value as string;
    }
  });
});

describe("SapIntegrationService", () => {
  it("marks segments as success when integration is disabled", async () => {
    process.env.SAP_SYNC_ENABLED = "false";
    const service = new SapIntegrationService();
    const onStateChange = vi.fn();
    const partner = createPartner();

    const result = await service.integratePartner(partner, { onStateChange });

    expect(result.completed).toBe(true);
    expect(result.segments).toHaveLength(4);
    expect(result.segments.every((segment) => segment.status === "success")).toBe(true);
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it("marks segments as error when SAP is not configured", async () => {
    const service = new SapIntegrationService();
    const partner = createPartner();

    const result = await service.integratePartner(partner);

    expect(result.completed).toBe(false);
    expect(result.segments.every((segment) => segment.status === "error")).toBe(true);
  });

  it("sends requests sequentially and captures SAP id", async () => {
    process.env.SAP_BASE_URL = "https://sap.example";
    process.env.SAP_USER = "user";
    process.env.SAP_PASSWORD = "secret";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockFetchResponse({ businessPartnerId: "BP100" }))
      .mockResolvedValueOnce(mockFetchResponse({}))
      .mockResolvedValueOnce(mockFetchResponse({}))
      .mockResolvedValueOnce(mockFetchResponse({}));

    vi.stubGlobal("fetch", fetchMock);

    const service = new SapIntegrationService();
    const partner = createPartner();
    const onStateChange = vi.fn();

    const result = await service.integratePartner(partner, { onStateChange });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://sap.example/business-partners",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://sap.example/business-partners/addresses",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(result.completed).toBe(true);
    const firstSegment = result.segments.find((segment) => segment.segment === "businessPartner");
    expect(firstSegment?.status).toBe("success");
    expect(firstSegment?.sapId).toBe("BP100");
    expect(result.updates.sapBusinessPartnerId).toBe("BP100");
    expect(onStateChange).toHaveBeenCalled();
  });

  it("stops integration on first failure", async () => {
    process.env.SAP_BASE_URL = "https://sap.example";
    process.env.SAP_USER = "user";
    process.env.SAP_PASSWORD = "secret";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockFetchResponse({ businessPartnerId: "BP100" }))
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => JSON.stringify({ message: "Erro" }) });

    vi.stubGlobal("fetch", fetchMock);

    const service = new SapIntegrationService();
    const partner = createPartner();
    const onStateChange = vi.fn();

    const result = await service.integratePartner(partner, { onStateChange });

    expect(result.completed).toBe(false);
    const statuses = result.segments.reduce<Record<string, string>>((acc, segment) => {
      acc[segment.segment] = segment.status;
      return acc;
    }, {});
    expect(statuses.businessPartner).toBe("success");
    expect(statuses.addresses).toBe("error");
    expect(statuses.roles).toBe("pending");
    expect(statuses.banks).toBe("pending");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://sap.example/business-partners/addresses",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(onStateChange).toHaveBeenCalledTimes(4);
  });

  it("skips retry when there are no pending segments", async () => {
    const service = new SapIntegrationService();
    const partner = createPartner({
      sap_segments: [
        { segment: "businessPartner", status: "success" },
        { segment: "addresses", status: "success" },
        { segment: "roles", status: "success" },
        { segment: "banks", status: "success" }
      ] as any
    });

    const result = await service.retry(partner);

    expect(result.completed).toBe(true);
    expect(result.segments.every((segment) => segment.status === "success")).toBe(true);
  });

  it("extracts detailed error messages returned by SAP payloads", async () => {
    process.env.SAP_BASE_URL = "https://sap.example";
    process.env.SAP_USER = "user";
    process.env.SAP_PASSWORD = "secret";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockFetchResponse({ Messages: [{ message: "Documento inválido" }] }, 400)
      );

    vi.stubGlobal("fetch", fetchMock);

    const service = new SapIntegrationService();
    const partner = createPartner();

    const result = await service.integratePartner(partner, { segments: ["businessPartner"] });

    const state = result.segments.find((item) => item.segment === "businessPartner");
    expect(result.completed).toBe(false);
    expect(state?.status).toBe("error");
    expect(state?.errorMessage).toBe("Documento inválido");
  });

  it("marks selected segments as error", () => {
    const service = new SapIntegrationService();
    const partner = createPartner({
      sap_segments: [
        {
          segment: "businessPartner",
          status: "success",
          sapId: "BP10",
          lastSuccessAt: new Date().toISOString()
        }
      ] as any
    });

    const updated = service.markSegmentsAsError(partner, "Rejeitado manualmente", ["addresses"]);

    const bpState = updated.find((item) => item.segment === "businessPartner");
    const addressState = updated.find((item) => item.segment === "addresses");

    expect(bpState?.status).toBe("success");
    expect(bpState?.sapId).toBe("BP10");
    expect(addressState?.status).toBe("error");
    expect(addressState?.errorMessage).toBe("Rejeitado manualmente");
  });
});
