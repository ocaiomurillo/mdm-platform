import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Partner } from "./partner.entity";
import { PartnerAuditJob } from "./partner-audit-job.entity";

@Entity("partner_audit_logs")
export class PartnerAuditLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "job_id" })
  jobId!: string;

  @ManyToOne(() => PartnerAuditJob, (job) => job.logs, { onDelete: "CASCADE" })
  job!: PartnerAuditJob;

  @Column({ name: "partner_id" })
  partnerId!: string;

  @ManyToOne(() => Partner, (partner) => partner.auditLogs, { onDelete: "CASCADE" })
  partner!: Partner;

  @Column({ type: "varchar", length: 20 })
  result!: "ok" | "inconsistente" | "erro";

  @Column({ type: "jsonb", nullable: true })
  differences?: any;

  @Column({ name: "external_data", type: "jsonb", nullable: true })
  externalData?: any;

  @Column({ type: "text", nullable: true })
  message?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}