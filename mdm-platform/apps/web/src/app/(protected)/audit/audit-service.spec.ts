import axios from "axios";
import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  fetchAuditJobStatus,
  normalizeAuditJob,
  triggerBulkAudit,
  triggerIndividualAudit
} from "./audit-service";

type MockedAxios = {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn()
  }
}));

const mockedAxios = axios as unknown as MockedAxios;

beforeEach(() => {
  mockedAxios.post.mockReset();
  mockedAxios.get.mockReset();
});

describe("audit-service", () => {
  it("solicita auditoria individual com payload e headers corretos", async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        jobId: "job-123",
        status: "pending"
      }
    });

    const job = await triggerIndividualAudit({
      apiUrl: "https://api.mdm.test",
      token: "token123",
      partnerId: "partner-1",
      requestedBy: "user@example.com"
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://api.mdm.test/partners/partner-1/audit",
      { requestedBy: "user@example.com" },
      { headers: { Authorization: "Bearer token123" } }
    );

    expect(job).toMatchObject({
      jobId: "job-123",
      status: "pending",
      partnerIds: ["partner-1"],
      origin: "individual",
      requestedBy: "user@example.com"
    });
  });

  it("faz fallback para jobId combinado quando auditoria em massa não retorna identificador", async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        status: "queued"
      }
    });

    const job = await triggerBulkAudit({
      apiUrl: "https://api.mdm.test",
      token: "token123",
      partnerIds: ["a", "b"],
      requestedBy: undefined
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://api.mdm.test/partners/audit",
      { partnerIds: ["a", "b"] },
      { headers: { Authorization: "Bearer token123" } }
    );

    expect(job.jobId).toBe("a,b");
    expect(job.origin).toBe("bulk");
    expect(job.partnerIds).toEqual(["a", "b"]);
  });

  it("busca status do job de auditoria e normaliza campos", async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        jobId: "job-999",
        status: "completed",
        partnerIds: ["partner-x"],
        requestedBy: "auditor",
        origin: "individual",
        completedAt: "2024-01-01T10:00:00.000Z"
      }
    });

    const job = await fetchAuditJobStatus({
      apiUrl: "https://api.mdm.test/",
      token: "token123",
      jobId: "job-999"
    });

    expect(mockedAxios.get).toHaveBeenCalledWith("https://api.mdm.test/partners/audit/job-999", {
      headers: { Authorization: "Bearer token123" }
    });

    expect(job).toMatchObject({
      jobId: "job-999",
      status: "completed",
      partnerIds: ["partner-x"],
      requestedBy: "auditor",
      origin: "individual",
      completedAt: "2024-01-01T10:00:00.000Z"
    });
  });

  it("lança erro quando a normalização não encontra identificador de job", () => {
    expect(() => normalizeAuditJob({}, {})).toThrowError("Resposta de auditoria sem identificador de job");
  });
});
