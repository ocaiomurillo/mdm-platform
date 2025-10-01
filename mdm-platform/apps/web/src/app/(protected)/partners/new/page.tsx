"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { onlyDigits } from "@mdm/utils";

const emailSchema = z.object({
  endereco: z.string().email("Email inválido"),
  padrao: z.boolean().optional()
});

const bankSchema = z.object({
  banco: z.string().min(2, "Informe o banco"),
  agencia: z.string().min(1, "Informe a agência"),
  conta: z.string().min(1, "Informe a conta"),
  pix: z.string().optional()
});

const transportSchema = z.object({
  sap_bp: z.string().min(1, "Informe o código BP")
});

const schema = z.object({
  tipo_pessoa: z.enum(["PJ", "PF"]),
  natureza: z.enum(["cliente", "fornecedor", "ambos"]),
  documento: z.string().min(11, "Informe um documento válido"),
  nome_legal: z.string().min(2, "Informe o nome legal"),
  nome_fantasia: z.string().optional(),
  contato_nome: z.string().min(2, "Informe o responsável"),
  contato_email: z.string().email("Email inválido"),
  contato_fone: z.string().optional(),
  telefone: z.string().optional(),
  celular: z.string().optional(),
  comunicacao_emails: z.array(emailSchema).min(1, "Inclua ao menos um email"),
  ie: z.string().optional(),
  im: z.string().optional(),
  suframa: z.string().optional(),
  regime_tributario: z.string().optional(),
  cep: z.string().min(8, "Informe o CEP"),
  logradouro: z.string().min(2, "Informe o logradouro"),
  numero: z.string().min(1, "Informe o número"),
  complemento: z.string().optional(),
  bairro: z.string().min(2, "Informe o bairro"),
  municipio: z.string().min(2, "Informe o município"),
  municipio_ibge: z.string().optional(),
  uf: z.string().length(2, "Informe apenas a sigla da UF"),
  banks: z.array(bankSchema).min(1, "Inclua ao menos uma conta"),
  fornecedor_grupo: z.string().optional(),
  fornecedor_condicao: z.string().optional(),
  vendas_vendedor: z.string().optional(),
  vendas_grupo: z.string().optional(),
  fiscal_natureza_operacao: z.string().optional(),
  fiscal_tipo_beneficio: z.string().optional(),
  fiscal_regime_declaracao: z.string().optional(),
  transportadores: z.array(transportSchema).optional(),
  credito_parceiro: z.string().optional(),
  credito_modalidade: z.string().optional(),
  credito_montante: z
    .union([z.string().length(0), z.string().min(1)])
    .optional()
    .transform((value) => (value && value.trim().length ? value : undefined)),
  credito_validade: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

type LookupResult = {
  nome?: string;
  nome_social?: string;
  email?: string;
  telefone?: string;
  data_nascimento?: string;
  endereco?: {
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    municipio_ibge?: string;
    uf?: string;
  };
  inscricao_estadual?: string;
};

const natureMatches = (natureza: string, targets: Array<'cliente' | 'fornecedor'>) => {
  return targets.some((target) => natureza === target || natureza === 'ambos');
};

export default function NewPartner() {
  const router = useRouter();
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo_pessoa: "PJ",
      natureza: "cliente",
      comunicacao_emails: [{ endereco: "", padrao: true }],
      banks: [{ banco: "", agencia: "", conta: "", pix: "" }],
      transportadores: []
    }
  });

  const natureza = watch("natureza");
  const tipoPessoa = watch("tipo_pessoa");

  const {
    fields: emailFields,
    append: appendEmail,
    remove: removeEmail,
    replace: replaceEmails
  } = useFieldArray({ control, name: "comunicacao_emails" });

  const {
    fields: bankFields,
    append: appendBank,
    remove: removeBank
  } = useFieldArray({ control, name: "banks" });

  const {
    fields: transportFields,
    append: appendTransport,
    remove: removeTransport
  } = useFieldArray({ control, name: "transportadores" });

  const requiresFornecedor = useMemo(() => natureMatches(natureza, ['fornecedor']), [natureza]);
  const requiresCliente = useMemo(() => natureMatches(natureza, ['cliente']), [natureza]);

  const applyLookupData = (data: LookupResult) => {
    if (!data) return;
    if (data.nome) {
      setValue("nome_legal", data.nome, { shouldValidate: true });
      if (tipoPessoa === "PF") {
        setValue("contato_nome", data.nome, { shouldValidate: true });
      }
    }
    if (data.email) {
      replaceEmails([{ endereco: data.email, padrao: true }]);
      setValue("contato_email", data.email, { shouldValidate: true });
    }
    if (data.telefone) {
      setValue("telefone", data.telefone);
      if (!watch("contato_fone")) {
        setValue("contato_fone", data.telefone);
      }
    }
    if (data.inscricao_estadual) {
      setValue("ie", data.inscricao_estadual);
    }
    if (data.endereco) {
      const { cep, logradouro, numero, complemento, bairro, municipio, municipio_ibge, uf } = data.endereco;
      if (cep) setValue("cep", cep, { shouldValidate: true });
      if (logradouro) setValue("logradouro", logradouro, { shouldValidate: true });
      if (numero) setValue("numero", `${numero}`, { shouldValidate: true });
      if (complemento) setValue("complemento", complemento);
      if (bairro) setValue("bairro", bairro, { shouldValidate: true });
      if (municipio) setValue("municipio", municipio.toUpperCase(), { shouldValidate: true });
      if (municipio_ibge) setValue("municipio_ibge", `${municipio_ibge}`);
      if (uf) setValue("uf", `${uf}`.toUpperCase().slice(0, 2), { shouldValidate: true });
    }
  };

  const handleLookupDocumento = async () => {
    const rawDoc = watch("documento") || "";
    const digits = onlyDigits(rawDoc);
    const expectedLength = tipoPessoa === "PJ" ? 14 : 11;
    if (digits.length !== expectedLength) {
      setDocError(`Informe um ${tipoPessoa === "PJ" ? 'CNPJ' : 'CPF'} válido para buscar.`);
      return;
    }
    setDocError(null);
    setDocLoading(true);

    try {
      const token = localStorage.getItem("mdmToken");
      const urlSuffix = tipoPessoa === "PJ" ? `cnpj/${digits}` : `cpf/${digits}`;
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/partners/${urlSuffix}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = response.data as LookupResult;
      applyLookupData(data);
    } catch (error: any) {
      const message = error?.response?.data?.message;
      setDocError(typeof message === "string" ? message : "Não foi possível obter dados do documento.");
    } finally {
      setDocLoading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null);
    const token = localStorage.getItem("mdmToken");
    if (!token) {
      setSubmitError("Sessão expirada. Faça login novamente.");
      router.replace("/login");
      return;
    }

    const payload = {
      tipo_pessoa: values.tipo_pessoa,
      natureza: values.natureza,
      documento: onlyDigits(values.documento),
      nome_legal: values.nome_legal,
      nome_fantasia: values.nome_fantasia,
      ie: values.ie,
      im: values.im,
      suframa: values.suframa,
      regime_tributario: values.regime_tributario,
      contato_principal: {
        nome: values.contato_nome,
        email: values.contato_email,
        fone: values.contato_fone
      },
      comunicacao: {
        telefone: values.telefone,
        celular: values.celular,
        emails: values.comunicacao_emails.map((email, index) => ({
          endereco: email.endereco,
          padrao: email.padrao ?? index === 0
        }))
      },
      addresses: [
        {
          tipo: "fiscal",
          cep: onlyDigits(values.cep),
          logradouro: values.logradouro,
          numero: values.numero,
          complemento: values.complemento,
          bairro: values.bairro,
          municipio_ibge: values.municipio_ibge || values.municipio,
          uf: values.uf.toUpperCase(),
          municipio: values.municipio.toUpperCase(),
          pais: "BR"
        }
      ],
      banks: values.banks.map((bank) => ({
        ...bank,
        agencia: bank.agencia,
        conta: bank.conta
      })),
      fornecedor_info: requiresFornecedor
        ? {
            grupo: values.fornecedor_grupo,
            condicao_pagamento: values.fornecedor_condicao
          }
        : {},
      vendas_info: requiresCliente
        ? {
            vendedor: values.vendas_vendedor,
            grupo_clientes: values.vendas_grupo
          }
        : {},
      fiscal_info: {
        natureza_operacao: values.fiscal_natureza_operacao,
        tipo_beneficio_suframa: values.fiscal_tipo_beneficio,
        regime_declaracao: values.fiscal_regime_declaracao
      },
      transportadores: (values.transportadores || []).filter((item) => item.sap_bp),
      credito_info: {
        parceiro: values.credito_parceiro,
        modalidade: values.credito_modalidade,
        montante: values.credito_montante ? Number(values.credito_montante.replace(/[^0-9.,-]/g, '').replace(',', '.')) : undefined,
        validade: values.credito_validade
      },
      sap_segments: []
    };

    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/partners`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      router.push("/partners");
    } catch (error: any) {
      const message = error?.response?.data?.message;
      setSubmitError(typeof message === "string" ? message : "Não foi possível salvar o parceiro.");
    }
  };

  const renderError = (fieldPath: keyof FormValues | string) => {
    const segments = fieldPath.split('.') as any;
    let current: any = errors;
    for (const segment of segments) {
      if (!current) break;
      current = current[segment];
    }
    if (!current) return null;
    const message = current?.message || current?.root?.message;
    if (!message) return null;
    return <p className="text-sm text-red-600">{message}</p>;
  };

  return (
    <main className="p-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-zinc-900">Novo Parceiro</h1>
          <p className="text-sm text-zinc-500">Preencha todas as informações necessárias para integrar o parceiro ao SAP.</p>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Classificação</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Tipo de pessoa</label>
                <select {...register("tipo_pessoa")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                  <option value="PJ">Pessoa Jurídica</option>
                  <option value="PF">Pessoa Física</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Natureza</label>
                <select {...register("natureza")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                  <option value="cliente">Cliente</option>
                  <option value="fornecedor">Fornecedor</option>
                  <option value="ambos">Ambos</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Identificação</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Documento</label>
                <div className="flex gap-2">
                  <input
                    {...register("documento")}
                    placeholder={tipoPessoa === "PJ" ? "CNPJ" : "CPF"}
                    className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleLookupDocumento}
                    disabled={docLoading}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors disabled:cursor-not-allowed disabled:opacity-60 hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    {docLoading ? "Buscando..." : `Buscar ${tipoPessoa === "PJ" ? 'CNPJ' : 'CPF'}`}
                  </button>
                </div>
                {renderError("documento")}
                {docError && <p className="mt-1 text-sm text-red-600">{docError}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Inscrição Estadual</label>
                <input {...register("ie")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Opcional" />
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Nome legal</label>
                <input {...register("nome_legal")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Razão social / Nome completo" />
                {renderError("nome_legal")}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Nome fantasia</label>
                <input {...register("nome_fantasia")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Opcional" />
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Inscrição Municipal</label>
                <input {...register("im")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Opcional" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">SUFRAMA</label>
                <input {...register("suframa")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Opcional" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Regime tributário</label>
                <input {...register("regime_tributario")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Simples, Lucro Presumido..." />
              </div>
            </div>
          </section>

          {/* remaining sections unchanged */}          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Comunicação</h2>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Telefone</label>
                <input {...register("telefone")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="(00) 0000-0000" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Celular</label>
                <input {...register("celular")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Emails</span>
                <button
                  type="button"
                  onClick={() => appendEmail({ endereco: "", padrao: emailFields.length === 0 })}
                  className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
                >
                  Adicionar email
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {emailFields.map((field, index) => (
                  <div key={field.id} className="grid gap-3 md:grid-cols-12 md:items-center">
                    <div className="md:col-span-6">
                      <input
                        {...register(`comunicacao_emails.${index}.endereco` as const)}
                        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="email@empresa.com"
                      />
                      {renderError(`comunicacao_emails.${index}.endereco`)}
                    </div>
                    <div className="md:col-span-3 flex items-center gap-2">
                      <input
                        type="checkbox"
                        {...register(`comunicacao_emails.${index}.padrao` as const)}
                        className="h-4 w-4 rounded border border-zinc-300"
                      />
                      <span className="text-sm text-zinc-600">Email padrão</span>
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeEmail(index)}
                        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50"
                        disabled={emailFields.length === 1}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Dados bancários</h2>
              <button
                type="button"
                onClick={() => appendBank({ banco: "", agencia: "", conta: "", pix: "" })}
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
              >
                Adicionar conta
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Conta bancária deve estar em nome da empresa ou pessoa física cadastrada.</p>
            <div className="mt-3 space-y-3">
              {bankFields.map((field, index) => (
                <div key={field.id} className="rounded-xl border border-zinc-200 p-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Banco</label>
                      <input {...register(`banks.${index}.banco` as const)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                      {renderError(`banks.${index}.banco`)}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Agência</label>
                      <input {...register(`banks.${index}.agencia` as const)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                      {renderError(`banks.${index}.agencia`)}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Conta</label>
                      <input {...register(`banks.${index}.conta` as const)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                      {renderError(`banks.${index}.conta`)}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Chave PIX</label>
                      <input {...register(`banks.${index}.pix` as const)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Opcional" />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeBank(index)}
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50"
                      disabled={bankFields.length === 1}
                    >
                      Remover conta
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {requiresFornecedor && (
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Informações de fornecimento</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Grupo de fornecedores</label>
                  <input {...register("fornecedor_grupo")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Condição de pagamento padrão</label>
                  <input {...register("fornecedor_condicao")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                </div>
              </div>
            </section>
          )}

          {requiresCliente && (
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Informações de vendas</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Vendedor responsável</label>
                  <input {...register("vendas_vendedor")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Grupo de clientes</label>
                  <input {...register("vendas_grupo")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                </div>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Informações fiscais</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Natureza da operação</label>
                <select {...register("fiscal_natureza_operacao")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                  <option value="">Selecione</option>
                  <option value="comercializacao">Comercialização</option>
                  <option value="consumo">Consumo</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Benefício SUFRAMA</label>
                <input {...register("fiscal_tipo_beneficio")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Opcional" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Regime de declaração</label>
                <input {...register("fiscal_regime_declaracao")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="EFD, Simples, etc." />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Informações de transporte</h2>
              <button
                type="button"
                onClick={() => appendTransport({ sap_bp: "" })}
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
              >
                Adicionar BP transportador
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {transportFields.length ? (
                transportFields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-3">
                    <input
                      {...register(`transportadores.${index}.sap_bp` as const)}
                      className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="BP SAP transportador"
                    />
                    <button
                      type="button"
                      onClick={() => removeTransport(index)}
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50"
                    >
                      Remover
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">Nenhum transportador adicionado.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Informações de crédito</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Parceiro de crédito</label>
                <input {...register("credito_parceiro")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Inferior / Dinâmica" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Modalidade</label>
                <input {...register("credito_modalidade")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Inferior ou Dinâmica" />
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Montante aprovado</label>
                <input {...register("credito_montante")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Ex.: 50000" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Validade</label>
                <input type="date" {...register("credito_validade")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              </div>
            </div>
          </section>

          {submitError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</div>}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            >
              {isSubmitting ? "Salvando..." : "Salvar parceiro"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
