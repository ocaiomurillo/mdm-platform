import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewPartner from "../page";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

const routerPushMock = vi.fn();
const routerReplaceMock = vi.fn();
const routerBackMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
    back: routerBackMock
  })
}));

type AxiosMock = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const axiosMock = axios as unknown as AxiosMock;

describe("NewPartner address form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockReset();
    axiosMock.post.mockReset();
    axiosMock.put.mockReset();
    axiosMock.patch.mockReset();
    axiosMock.delete.mockReset();
    routerPushMock.mockReset();
    routerReplaceMock.mockReset();
    routerBackMock.mockReset();
    localStorage.clear();
    localStorage.setItem("mdmToken", "token");
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3333";
  });

  it("fills address fields from CEP lookup and preserves manual edits", async () => {
    const user = userEvent.setup();

    axiosMock.get.mockResolvedValueOnce({
      data: {
        cep: "01001-000",
        street: "Praça da Sé",
        neighborhood: "Sé",
        city: "São Paulo",
        state: "SP",
        city_ibge: 3550308
      }
    });

    render(<NewPartner />);

    const cepInput = screen.getByPlaceholderText("00000-000");

    await user.clear(cepInput);
    await user.type(cepInput, "01001000");
    await user.click(screen.getByRole("button", { name: /buscar cep/i }));

    const logradouroInput = await screen.findByPlaceholderText("Rua, avenida...");

    await waitFor(() => {
      expect(logradouroInput).toHaveValue("PRAÇA DA SÉ");
    });

    const bairroInput = screen.getByPlaceholderText("Bairro");
    expect(bairroInput).toHaveValue("SÉ");

    const municipioInput = screen.getByPlaceholderText("Cidade");
    expect(municipioInput).toHaveValue("SÃO PAULO");

    const ufInput = screen.getByPlaceholderText("UF");
    expect(ufInput).toHaveValue("SP");

    const initialIbgeInput = document.querySelector<HTMLInputElement>('input[name="municipio_ibge"]');
    expect(initialIbgeInput?.value).toBe("3550308");

    await user.clear(bairroInput);
    await user.type(bairroInput, "Centro Histórico");

    axiosMock.get.mockResolvedValueOnce({
      data: {
        cep: "22231-010",
        street: "Rua das Laranjeiras",
        neighborhood: "Laranjeiras",
        city: "Rio de Janeiro",
        state: "RJ",
        city_ibge: 3304557
      }
    });

    await user.clear(cepInput);
    await user.type(cepInput, "22231010");
    await user.click(screen.getByRole("button", { name: /buscar cep/i }));

    await waitFor(() => {
      expect(logradouroInput).toHaveValue("RUA DAS LARANJEIRAS");
    });

    await waitFor(() => {
      expect(axiosMock.get).toHaveBeenCalledTimes(2);
    });

    expect(axiosMock.get).toHaveBeenNthCalledWith(1, "https://brasilapi.com.br/api/cep/v2/01001000");
    expect(axiosMock.get).toHaveBeenNthCalledWith(2, "https://brasilapi.com.br/api/cep/v2/22231010");

    expect(bairroInput).toHaveValue("Centro Histórico");
    expect(municipioInput).toHaveValue("RIO DE JANEIRO");
    expect(ufInput).toHaveValue("RJ");

    const updatedIbgeInput = document.querySelector<HTMLInputElement>('input[name="municipio_ibge"]');
    expect(updatedIbgeInput?.value).toBe("3304557");
  });

  it("shows address validation errors when submitting empty form", async () => {
    const user = userEvent.setup();

    render(<NewPartner />);

    await user.click(screen.getByRole("button", { name: /salvar parceiro/i }));

    expect(await screen.findByText("Informe o CEP")).toBeInTheDocument();
    expect(screen.getByText("Informe o logradouro")).toBeInTheDocument();
    expect(screen.getByText("Informe o número")).toBeInTheDocument();
    expect(axiosMock.post).not.toHaveBeenCalled();
  });
});
