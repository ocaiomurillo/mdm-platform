"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  useForm,
  useFieldArray,
  type FieldPath,
  type FieldPathValue
} from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  onlyDigits,
  validateCEP,
  validateCNPJ,
  validateCPF,
  validateIbgeCode,
  validateIE
} from "@mdm/utils";

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

const baseSchemaFields = {
  natureza: z.enum(["cliente", "fornecedor", "ambos"]),
  nome_fantasia: z.string().optional(),
  contato_nome: z.string().min(2, "Informe o responsável"),
  contato_email: z.string().email("Email inválido"),
  contato_fone: z.string().optional(),
  telefone: z.string().optional(),
  celular: z.string().optional(),
  comunicacao_emails: z.array(emailSchema).min(1, "Inclua ao menos um email"),
  ie: z
    .string()
    .optional()
    .refine((value) => !value || validateIE(value, { allowIsento: true }), {
      message: "Inscrição estadual inválida"
    }),
  im: z.string().optional(),
  suframa: z.string().optional(),
  regime_tributario: z.string().optional(),
  cep: z
    .string()
    .min(1, "Informe o CEP")
    .refine((value) => validateCEP(value), "CEP inválido"),
  logradouro: z.string().min(2, "Informe o logradouro"),
  numero: z.string().min(1, "Informe o número"),
  complemento: z.string().optional(),
  bairro: z.string().min(2, "Informe o bairro"),
  municipio: z.string().min(2, "Informe o município"),
  municipio_ibge: z
    .string()
    .optional()
    .refine((value) => !value || !value.trim() || validateIbgeCode(value), {
      message: "Código IBGE inválido"
    }),
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
};

const createSchema = (tipo: "PJ" | "PF") => {
  const isPJ = tipo === "PJ";
  return z
    .object({
      ...baseSchemaFields,
      tipo_pessoa: z.literal(tipo),
      documento: z
        .string()
        .min(1, `Informe o ${isPJ ? "CNPJ" : "CPF"}`)
        .refine((value) => {
          const digits = onlyDigits(value || "");
          return isPJ ? validateCNPJ(digits) : validateCPF(digits);
        }, {
          message: isPJ ? "CNPJ inválido" : "CPF inválido"
        }),
      nome_legal: z.string().min(2, isPJ ? "Informe a razão social" : "Informe o nome completo")
    });
};

  if (data.ie && !validateIE(data.ie, { allowIsento: true })) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ie"], message: "Inscrição estadual inválida" });
  }
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

type ViaCepResponse = {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  service?: string;
  city_ibge?: string | number;
  ddd?: string;
  location?: {
    type: string;
    coordinates: {
      longitude: string;
      latitude: string;
    };
  };
};

const natureMatches = (natureza: string, targets: Array<'cliente' | 'fornecedor'>) => {
  return targets.some((target) => natureza === target || natureza === 'ambos');
};

const readOnlyAddressInputClass =
  "w-full rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-600";

export default function NewPartner() {
  const router = useRouter();
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

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
  const formValues = watch();

  const natureLabels: Record<FormValues["natureza"], string> = {
    cliente: "Cliente",
    fornecedor: "Fornecedor",
    ambos: "Cliente e fornecedor"
  };

  const getErrorAtPath = (fieldPath: string) => {
    const segments = fieldPath.split(".") as any;
    let current: any = errors;
    for (const segment of segments) {
      if (!current) break;
      current = current[segment];
    }
    return current ?? null;
  };

  const isFilledString = (value: unknown) => {
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    return Boolean(value);
  };

  const emails = formValues?.comunicacao_emails ?? [];
  const banks = formValues?.banks ?? [];
  const transporters = formValues?.transportadores ?? [];

  const requiresFornecedor = useMemo(() => natureMatches(natureza, ["fornecedor"]), [natureza]);
  const requiresCliente = useMemo(() => natureMatches(natureza, ["cliente"]), [natureza]);

  const hasAnyError = (paths: string[]) => paths.some((path) => Boolean(getErrorAtPath(path)));

  const timelineSteps = useMemo(() => {
    const typeLabel = tipoPessoa === "PJ" ? "Pessoa Jurídica" : "Pessoa Física";

    const identificationComplete =
      isFilledString(formValues?.documento) &&
      isFilledString(formValues?.nome_legal) &&
      !hasAnyError(["documento", "nome_legal"]);

    const addressComplete =
      ["cep", "logradouro", "numero", "bairro", "municipio", "uf"].every((field) =>
        isFilledString((formValues as any)?.[field])
      ) && !hasAnyError(["cep", "logradouro", "numero", "bairro", "municipio", "uf", "municipio_ibge"]);

    const contactEmailsComplete =
      emails.length > 0 &&
      emails.every((email) => isFilledString(email?.endereco)) &&
      !hasAnyError(["comunicacao_emails"]);

    const contactComplete =
      isFilledString(formValues?.contato_nome) &&
      isFilledString(formValues?.contato_email) &&
      contactEmailsComplete &&
      !hasAnyError(["contato_nome", "contato_email"]);

    const financeComplete =
      banks.length > 0 &&
      banks.every((bank) => isFilledString(bank?.banco) && isFilledString(bank?.agencia) && isFilledString(bank?.conta)) &&
      !hasAnyError(["banks"]);

    const fornecedorComplete = !requiresFornecedor
      ? true
      : isFilledString(formValues?.fornecedor_grupo) &&
        isFilledString(formValues?.fornecedor_condicao) &&
        !hasAnyError(["fornecedor_grupo", "fornecedor_condicao"]);

    const vendasComplete = !requiresCliente
      ? true
      : isFilledString(formValues?.vendas_vendedor) &&
        isFilledString(formValues?.vendas_grupo) &&
        !hasAnyError(["vendas_vendedor", "vendas_grupo"]);

    const fiscalComplete = !hasAnyError([
      "fiscal_natureza_operacao",
      "fiscal_tipo_beneficio",
      "fiscal_regime_declaracao"
    ]);

    const transportComplete =
      (transporters.length === 0 || transporters.every((item) => isFilledString(item?.sap_bp))) &&
      !hasAnyError(["transportadores"]);

    const creditComplete = !hasAnyError([
      "credito_parceiro",
      "credito_modalidade",
      "credito_montante",
      "credito_validade"
    ]);

    const steps = [
      {
        id: "classificacao",
        label: "Natureza",
        description: `${typeLabel} · ${natureLabels[natureza] ?? "Selecionar"}`,
        completed: !hasAnyError(["tipo_pessoa", "natureza"])
      },
      {
        id: "identificacao",
        label: "Identificação",
        description: "Documentos e dados legais",
        completed: identificationComplete
      },
      {
        id: "endereco",
        label: "Endereço",
        description: "Localização e CEP",
        completed: addressComplete
      },
      {
        id: "contato",
        label: "Contato",
        description: "Responsável e comunicação",
        completed: contactComplete
      },
      {
        id: "financeiro",
        label: "Financeiro",
        description: "Contas bancárias",
        completed: financeComplete
      }
    ];

    if (requiresFornecedor) {
      steps.push({
        id: "fornecedor",
        label: "Fornecimento",
        description: "Dados de fornecedor",
        completed: fornecedorComplete
      });
    }

    if (requiresCliente) {
      steps.push({
        id: "vendas",
        label: "Vendas",
        description: "Informações comerciais",
        completed: vendasComplete
      });
    }

    steps.push(
      {
        id: "fiscal",
        label: "Fiscal",
        description: "Regras fiscais",
        completed: fiscalComplete
      },
      {
        id: "transporte",
        label: "Transporte",
        description: "Transportadores",
        completed: transportComplete
      },
      {
        id: "credito",
        label: "Crédito",
        description: "Limites e condições",
        completed: creditComplete
      }
    );

    return steps;
  }, [
    banks,
    emails,
    errors,
    formValues,
    natureza,
    requiresCliente,
    requiresFornecedor,
    tipoPessoa,
    transporters
  ]);

  const activeStepId = useMemo(
    () => timelineSteps.find((step) => !step.completed)?.id ?? timelineSteps[timelineSteps.length - 1]?.id,
    [timelineSteps]
  );

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

  const setFieldIfEmpty = <K extends FieldPath<FormValues>>(
    field: K,
    value: FieldPathValue<FormValues, K>,
    options?: Parameters<typeof setValue>[2]
  ) => {
    if (value === undefined || value === null) {
      return;
    }

    if (typeof value === "string" && !value.trim()) {
      return;
    }

    const currentValue = watch(field);
    const isEmpty =
      currentValue === undefined ||
      currentValue === null ||
      (typeof currentValue === "string" && currentValue.trim().length === 0);

    if (isEmpty) {
      setValue(field, value, options);
    }
  };

  const applyLookupData = (data: LookupResult) => {
    if (!data) return;
    if (data.nome) {
      setFieldIfEmpty("nome_legal", data.nome, { shouldValidate: true });
      if (tipoPessoa === "PF") {
        setFieldIfEmpty("contato_nome", data.nome, { shouldValidate: true });
      }
    }
    if (data.nome_social) {
      setValue("nome_fantasia", data.nome_social, { shouldValidate: false });
    }
    if (data.email) {
      const emailEntries = watch("comunicacao_emails");
      const hasEmail = emailEntries?.some((entry) => entry?.endereco && entry.endereco.trim());
      if (!hasEmail) {
        replaceEmails([{ endereco: data.email, padrao: true }]);
      }
      setFieldIfEmpty("contato_email", data.email, { shouldValidate: true });
    }
    if (data.telefone) {
      setFieldIfEmpty("telefone", data.telefone);
      setFieldIfEmpty("contato_fone", data.telefone);
    }
    if (data.inscricao_estadual) {
      setFieldIfEmpty("ie", data.inscricao_estadual);
    }
    if (data.endereco) {
      const { cep, logradouro, numero, complemento, bairro, municipio, municipio_ibge, uf } = data.endereco;
      if (typeof cep === "string") {
        setValue("cep", cep, { shouldValidate: true });
      }
      if (typeof logradouro === "string") {
        setValue("logradouro", logradouro.toUpperCase(), { shouldValidate: true });
      }
      if (numero !== undefined && numero !== null) {
        setValue("numero", `${numero}`, { shouldValidate: true });
      }
      if (typeof complemento === "string") {
        setValue("complemento", complemento.toUpperCase());
      }
      if (typeof bairro === "string") {
        setValue("bairro", bairro.toUpperCase(), { shouldValidate: true });
      }
      if (typeof municipio === "string") {
        setValue("municipio", municipio.toUpperCase(), { shouldValidate: true });
      }
      if (municipio_ibge !== undefined && municipio_ibge !== null) {
        setValue("municipio_ibge", `${municipio_ibge}`);
      }
      if (typeof uf === "string") {
        setValue("uf", uf.toUpperCase().slice(0, 2), { shouldValidate: true });
      }
    }
  };

  const handleLookupDocumento = async () => {
    const rawDoc = watch("documento") || "";
    const digits = onlyDigits(rawDoc);
    const isValidDocument = tipoPessoa === "PJ" ? validateCNPJ(digits) : validateCPF(digits);
    if (!isValidDocument) {
      setDocError(`Informe um ${tipoPessoa === "PJ" ? "CNPJ" : "CPF"} válido para buscar.`);
      return;
    }
    setDocError(null);
    setDocLoading(true);

    try {
      const token = localStorage.getItem("mdmToken");
      if (!token) {
        router.replace("/login");
        return;
      }
      const urlSuffix = tipoPessoa === "PJ" ? `cnpj/${digits}` : `cpf/${digits}`;
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/partners/${urlSuffix}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = response.data as LookupResult;
      applyLookupData(data);
    } catch (error: any) {
      if (error?.response?.status === 401) {
        localStorage.removeItem("mdmToken");
        router.replace("/login");
        return;
      }
      const message = error?.response?.data?.message;
      setDocError(typeof message === "string" ? message : "Não foi possível obter dados do documento.");
    } finally {
      setDocLoading(false);
    }
  };

  const handleLookupCep = async () => {
    if (cepLoading) return;

    const rawCep = watch("cep") || "";
    const digits = onlyDigits(rawCep);

    if (digits.length !== 8) {
      setCepError("CEP inválido.");
      return;
    }

    setCepError(null);
    setCepLoading(true);

    try {
      const response = await axios.get<ViaCepResponse>(`https://brasilapi.com.br/api/cep/v2/${digits}`);
      const data = response.data;

      if (!data || !data.cep) {
        setCepError("CEP inválido.");
        return;
      }

      const street = data.street?.trim();
      const neighborhood = data.neighborhood?.trim();
      const city = data.city?.trim();
      const state = data.state?.trim();
      const cityIbge = data.city_ibge ? `${data.city_ibge}` : undefined;

      setValue("cep", data.cep, { shouldValidate: true });
      if (street) setValue("logradouro", street.toUpperCase(), { shouldValidate: true });
      if (neighborhood) setValue("bairro", neighborhood.toUpperCase(), { shouldValidate: true });
      if (city) setValue("municipio", city.toUpperCase(), { shouldValidate: true });
      setValue("municipio_ibge", cityIbge, { shouldValidate: true });
      if (state) setValue("uf", state.toUpperCase().slice(0, 2), { shouldValidate: true });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        setCepError("CEP inválido.");
        return;
      }
      setCepError("CEP inválido.");
    } finally {
      setCepLoading(false);
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

    const sanitize = (value?: string | null) => {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    };

    const documentoLimpo = onlyDigits(values.documento);
    const nomeFantasia = sanitize(values.nome_fantasia);
    const inscricaoEstadual = sanitize(values.ie);
    const inscricaoMunicipal = sanitize(values.im);
    const regimeTributario = sanitize(values.regime_tributario);
    const suframa = sanitize(values.suframa);
    const telefone = sanitize(values.telefone);
    const celular = sanitize(values.celular);
    const contatoFone = sanitize(values.contato_fone);
    const complemento = sanitize(values.complemento);
    const municipioIbge = sanitize(values.municipio_ibge);
    const municipioValor = values.municipio.trim();
    const municipioUpper = municipioValor.toUpperCase();
    const ufValor = values.uf.trim().toUpperCase();
    const fornecedorGrupo = sanitize(values.fornecedor_grupo);
    const fornecedorCondicao = sanitize(values.fornecedor_condicao);
    const vendasVendedor = sanitize(values.vendas_vendedor);
    const vendasGrupo = sanitize(values.vendas_grupo);
    const fiscalNatureza = sanitize(values.fiscal_natureza_operacao);
    const fiscalBeneficio = sanitize(values.fiscal_tipo_beneficio);
    const fiscalRegime = sanitize(values.fiscal_regime_declaracao);
    const creditoParceiro = sanitize(values.credito_parceiro);
    const creditoModalidade = sanitize(values.credito_modalidade);
    const creditoMontanteRaw = sanitize(values.credito_montante);
    const creditoValidade = sanitize(values.credito_validade);

    const payload = {
      tipo_pessoa: values.tipo_pessoa,
      natureza: values.natureza,
      documento: documentoLimpo,
      nome_legal: values.nome_legal.trim(),
      ...(nomeFantasia ? { nome_fantasia: nomeFantasia } : {}),
      ...(values.tipo_pessoa === "PJ"
        ? {
            ...(inscricaoEstadual ? { ie: inscricaoEstadual } : {}),
            ...(inscricaoMunicipal ? { im: inscricaoMunicipal } : {}),
            ...(regimeTributario ? { regime_tributario: regimeTributario } : {}),
            ...(suframa ? { suframa } : {})
          }
        : {
            ...(suframa ? { suframa } : {})
          }),
      contato_principal: {
        nome: values.contato_nome.trim(),
        email: values.contato_email.trim(),
        ...(contatoFone ? { fone: contatoFone } : {})
      },
      comunicacao: {
        ...(telefone ? { telefone } : {}),
        ...(celular ? { celular } : {}),
        emails: values.comunicacao_emails.map((email, index) => ({
          endereco: email.endereco.trim(),
          padrao: email.padrao ?? index === 0
        }))
      },
      addresses: [
        {
          tipo: "fiscal",
          cep: onlyDigits(values.cep),
          logradouro: values.logradouro.trim(),
          numero: values.numero.trim(),
          ...(complemento ? { complemento } : {}),
          bairro: values.bairro.trim(),
          municipio_ibge: municipioIbge || municipioValor,
          uf: ufValor,
          municipio: municipioUpper,
          pais: "BR"
        }
      ],
      banks: values.banks.map((bank) => {
        const pix = sanitize(bank.pix);
        return {
          banco: bank.banco.trim(),
          agencia: bank.agencia.trim(),
          conta: bank.conta.trim(),
          ...(pix ? { pix } : {})
        };
      }),
      fornecedor_info: requiresFornecedor
        ? {
            ...(fornecedorGrupo ? { grupo: fornecedorGrupo } : {}),
            ...(fornecedorCondicao ? { condicao_pagamento: fornecedorCondicao } : {})
          }
        : {},
      vendas_info: requiresCliente
        ? {
            ...(vendasVendedor ? { vendedor: vendasVendedor } : {}),
            ...(vendasGrupo ? { grupo_clientes: vendasGrupo } : {})
          }
        : {},
      fiscal_info: {
        ...(fiscalNatureza ? { natureza_operacao: fiscalNatureza } : {}),
        ...(fiscalBeneficio ? { tipo_beneficio_suframa: fiscalBeneficio } : {}),
        ...(fiscalRegime ? { regime_declaracao: fiscalRegime } : {})
      },
      transportadores: (values.transportadores || [])
        .map((item) => item.sap_bp?.trim())
        .filter((sapBp): sapBp is string => Boolean(sapBp))
        .map((sapBp) => ({ sap_bp: sapBp })),
      credito_info: {
        ...(creditoParceiro ? { parceiro: creditoParceiro } : {}),
        ...(creditoModalidade ? { modalidade: creditoModalidade } : {}),
        ...(creditoMontanteRaw
          ? {
              montante: Number(creditoMontanteRaw.replace(/[^0-9.,-]/g, "").replace(",", "."))
            }
          : {}),
        ...(creditoValidade ? { validade: creditoValidade } : {})
      },
      sap_segments: []
    };

    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/partners`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      router.push("/partners");
    } catch (error: any) {
      if (error?.response?.status === 401) {
        localStorage.removeItem("mdmToken");
        router.replace("/login");
        return;
      }
      const message = error?.response?.data?.message;
      setSubmitError(typeof message === "string" ? message : "Não foi possível salvar o parceiro.");
    }
  };

  const renderError = (fieldPath: keyof FormValues | string) => {
    const segments = String(fieldPath).split(".") as Array<string>;
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
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-zinc-900">Novo Parceiro</h1>
          <p className="text-sm text-zinc-500">Preencha todas as informações necessárias para integrar o parceiro ao SAP.</p>
        </header>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-6 lg:h-[calc(100vh-220px)] lg:grid-cols-[minmax(0,260px),1fr] lg:items-start lg:overflow-hidden"
        >
          <aside className="lg:self-start">
            <nav
              aria-label="Etapas do cadastro"
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:border-none lg:bg-transparent lg:p-0 lg:shadow-none"
            >
              <ol className="flex gap-4 overflow-x-auto lg:flex-col lg:gap-6 lg:overflow-visible">
                {timelineSteps.map((step, index) => {
                  const isActive = activeStepId === step.id;
                  const isCompleted = step.completed;
                  const indicatorClass = isCompleted
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : isActive
                    ? "border-zinc-900 text-zinc-900"
                    : "border-zinc-300 bg-white text-zinc-400";
                  const labelClass = isCompleted
                    ? "text-emerald-700"
                    : isActive
                    ? "text-zinc-900"
                    : "text-zinc-600";

                  return (
                    <li key={step.id} className="flex-shrink-0 lg:flex-shrink">
                      <a
                        href={`#${step.id}`}
                        aria-label={`Etapa ${index + 1}: ${step.label}`}
                        aria-current={isActive ? "step" : undefined}
                        className={`flex min-w-[160px] items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 lg:w-full lg:min-w-0 lg:rounded-lg ${
                          isActive ? "bg-white shadow-sm lg:bg-zinc-50" : "hover:bg-white/70"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${indicatorClass}`}
                          aria-hidden="true"
                        >
                          {isCompleted ? (
                            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                              <path
                                d="M5 10.5l3 3 7-7"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className="flex flex-col">
                          <span className={`text-sm font-medium ${labelClass}`}>{step.label}</span>
                          {step.description && (
                            <span className="text-xs text-zinc-500">{step.description}</span>
                          )}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </aside>

          <div className="space-y-6 lg:h-full lg:overflow-y-auto lg:pr-4">
            <section id="classificacao" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
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

            <section id="identificacao" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
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

            <section id="endereco" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Endereço</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-6">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">CEP</label>
                  <div className="flex gap-2">
                    <input
                      {...register("cep")}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="00000-000"
                    />
                    <button
                      type="button"
                      onClick={handleLookupCep}
                      disabled={cepLoading}
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors disabled:cursor-not-allowed disabled:opacity-60 hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      {cepLoading ? "Buscando..." : "Buscar CEP"}
                    </button>
                  </div>
                  {renderError("cep")}
                  {cepError && <p className="mt-1 text-sm text-red-600">{cepError}</p>}
                </div>
                <div className="md:col-span-4">
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Logradouro</label>
                  <input
                    {...register("logradouro")}
                    readOnly
                    aria-readonly="true"
                    className={readOnlyAddressInputClass}
                    placeholder="Rua, avenida..."
                  />
                  {renderError("logradouro")}
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Número</label>
                  <input {...register("numero")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Nº" />
                  {renderError("numero")}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Complemento</label>
                  <input {...register("complemento")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Opcional" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Bairro</label>
                  <input
                    {...register("bairro")}
                    readOnly
                    aria-readonly="true"
                    className={readOnlyAddressInputClass}
                  />
                  {renderError("bairro")}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">UF</label>
                  <input
                    {...register("uf")}
                    readOnly
                    aria-readonly="true"
                    className={`${readOnlyAddressInputClass} uppercase`}
                    placeholder="UF"
                  />
                  {renderError("uf")}
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Município</label>
                  <input
                    {...register("municipio")}
                    readOnly
                    aria-readonly="true"
                    className={readOnlyAddressInputClass}
                  />
                  {renderError("municipio")}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Código IBGE</label>
                  <input
                    {...register("municipio_ibge")}
                    readOnly
                    aria-readonly="true"
                    className={readOnlyAddressInputClass}
                    placeholder="Opcional"
                  />
                  {renderError("municipio_ibge")}
                </div>
              </div>
            </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Endereço fiscal</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-6">
              <div className="md:col-span-3">
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">CEP</label>
                <div className="flex gap-2">
                  <input
                    {...register("cep")}
                    onBlur={handleLookupCep}
                    placeholder="00000-000"
                    className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleLookupCep}
                    disabled={cepLoading}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors disabled:cursor-not-allowed disabled:opacity-60 hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    {cepLoading ? "Buscando..." : "Buscar CEP"}
                  </button>
                </div>
                {renderError("cep")}
                {cepError && <p className="mt-1 text-sm text-red-600">{cepError}</p>}
              </div>
              <div className="md:col-span-3">
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Logradouro</label>
                <input
                  {...register("logradouro")}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="Rua, avenida..."
                />
                {renderError("logradouro")}
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-6">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Número</label>
                <input
                  {...register("numero")}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="000"
                />
                {renderError("numero")}
              </div>
              <div className="md:col-span-4">
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Complemento</label>
                <input
                  {...register("complemento")}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="Apartamento, sala..."
                />
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-6">
              <div className="md:col-span-3">
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Bairro</label>
                <input
                  {...register("bairro")}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="Bairro"
                />
                {renderError("bairro")}
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Município</label>
                <input
                  {...register("municipio")}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="Cidade"
                />
                {renderError("municipio")}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">UF</label>
                <input
                  {...register("uf")}
                  maxLength={2}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm uppercase"
                  placeholder="UF"
                />
                {renderError("uf")}
              </div>
            </div>
            <input type="hidden" {...register("municipio_ibge")} />
            {renderError("municipio_ibge")}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Comunicação</h2>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Telefone</label>
                <input {...register("telefone")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="(00) 0000-0000" />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3 md:mt-0">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Telefone do responsável</label>
                  <input {...register("contato_fone")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="(00) 0000-0000" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Telefone geral</label>
                  <input {...register("telefone")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="(00) 0000-0000" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Celular</label>
                  <input {...register("celular")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div className="mt-6 md:col-span-2">
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
            </div>
          </section>

            <section id="financeiro" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
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
              <section id="fornecedor" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
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
              <section id="vendas" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
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

            <section id="fiscal" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
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

            <section id="transporte" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
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

            <section id="credito" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
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
          </div>
        </form>
      </div>
    </main>
  );
}
