import { Column, CreateDateColumn, Entity, Generated, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { PartnerApprovalHistoryEntry, PartnerApprovalStage } from "@mdm/types";
import { PartnerAuditLog } from "./partner-audit-log.entity";
import { PartnerChangeRequest } from "./partner-change-request.entity";

@Entity("business_partners")
export class Partner {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "mdm_partner_id", type: "int", unique: true })
  @Generated("increment")
  mdmPartnerId!: number;

  @Column({ name: "sap_bp_id", type: "varchar", nullable: true })
  sapBusinessPartnerId?: string;

  @Column()
  tipo_pessoa!: "PJ" | "PF";

  @Column()
  natureza!: "cliente" | "fornecedor" | "ambos";

  @Column({ default: "draft" })
  status!: "draft" | "em_validacao" | "aprovado" | "rejeitado" | "integrado";

  @Column()
  nome_legal!: string;

  @Column({ nullable: true })
  nome_fantasia?: string;

  @Column()
  documento!: string;

  @Column({ nullable: true })
  ie?: string;

  @Column({ nullable: true })
  im?: string;

  @Column({ nullable: true })
  suframa?: string;

  @Column({ nullable: true })
  regime_tributario?: string;

  @Column("jsonb", { default: {} })
  contato_principal!: { nome: string; email: string; fone?: string };

  @Column("jsonb", { default: {} })
  comunicacao!: {
    telefone?: string;
    celular?: string;
    emails?: { endereco: string; padrao?: boolean }[];
  };

  @Column("jsonb", { default: [] })
  addresses!: any[];

  @Column("jsonb", { default: [] })
  banks!: any[];

  @Column("jsonb", { default: {} })
  fornecedor_info!: {
    grupo?: string;
    condicao_pagamento?: string;
  };

  @Column("jsonb", { default: {} })
  vendas_info!: {
    vendedor?: string;
    grupo_clientes?: string;
  };

  @Column("jsonb", { default: {} })
  fiscal_info!: {
    natureza_operacao?: string;
    tipo_beneficio_suframa?: string;
    regime_declaracao?: string;
  };

  @Column("jsonb", { default: [] })
  transportadores!: { sap_bp?: string }[];

  @Column("jsonb", { default: {} })
  credito_info!: {
    parceiro?: string;
    modalidade?: string;
    montante?: number;
    validade?: string;
  };

  @Column("jsonb", { default: [] })
  sap_segments!: any[];

  @Column({ name: "approval_stage", default: "fiscal" })
  approvalStage!: PartnerApprovalStage;

  @Column("jsonb", { name: "approval_history", default: [] })
  approvalHistory!: PartnerApprovalHistoryEntry[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => PartnerChangeRequest, (request) => request.partner)
  changeRequests!: PartnerChangeRequest[];

  @OneToMany(() => PartnerAuditLog, (log) => log.partner)
  auditLogs!: PartnerAuditLog[];
}
