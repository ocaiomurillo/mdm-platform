import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { mapSapPartnerPayload } from "../sap-sync.mapper";

describe("mapSapPartnerPayload", () => {
  it("maps core fields and sanitizes strings", () => {
    const payload = {
      sapBusinessPartnerId: "  BP-001  ",
      legalName: "Empresa X",
      tradeName: "X LTDA",
      document: "12.345.678/0001-99",
      personType: "PJ",
      nature: "cliente",
      status: "integrado",
      contact: { name: "João", email: "joao@example.com", phone: "1199999" },
      communication: {
        phone: "1130000000",
        emails: [
          { address: "financeiro@example.com", default: true },
          { address: null }
        ]
      },
      vendor: { grupo: "A" },
      sales: { vendedor: "123" },
      fiscal: { natureza_operacao: "5102" },
      credit: { modalidade: "30d" },
      addresses: [{ cep: "01001000" }],
      banks: [{ banco: "001" }],
      transporters: [{ sap_bp: "T1" }]
    };

    const result = mapSapPartnerPayload(payload as any);

    expect(result.sapBusinessPartnerId).toBe("BP-001");
    expect(result.nome_legal).toBe("Empresa X");
    expect(result.nome_fantasia).toBe("X LTDA");
    expect(result.documento).toBe("12.345.678/0001-99");
    expect(result.tipo_pessoa).toBe("PJ");
    expect(result.natureza).toBe("cliente");
    expect(result.status).toBe("integrado");
    expect(result.contato_principal).toEqual({ nome: "João", email: "joao@example.com", fone: "1199999" });
    expect(result.comunicacao).toEqual({ telefone: "1130000000", emails: [{ endereco: "financeiro@example.com", padrao: true }] });
    expect(result.fornecedor_info).toEqual({ grupo: "A" });
    expect(result.vendas_info).toEqual({ vendedor: "123" });
    expect(result.fiscal_info).toEqual({ natureza_operacao: "5102" });
    expect(result.credito_info).toEqual({ modalidade: "30d" });
    expect(result.addresses).toEqual([{ cep: "01001000" }]);
    expect(result.banks).toEqual([{ banco: "001" }]);
    expect(result.transportadores).toEqual([{ sap_bp: "T1" }]);
  });

  it("normalizes segments removing invalid entries", () => {
    const payload = {
      sapSegments: [
        { segment: "businessPartner", status: "success", sapId: "123" },
        { segment: "invalid", status: "ok" },
        { code: "banks", status: "error", message: "fail" }
      ]
    };

    const result = mapSapPartnerPayload(payload as any);

    expect(result.sap_segments).toEqual([
      { segment: "banks", status: "error", message: "fail" },
      { segment: "businessPartner", status: "success", sapId: "123" }
    ]);
  });
});

