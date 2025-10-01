import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { PartnerAuditLog } from "./partner-audit-log.entity";

@Entity("partner_audit_jobs")
export class PartnerAuditJob {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 20 })
  scope!: "individual" | "massa";

  @Column({ name: "partner_ids", type: "jsonb", default: () => "'[]'::jsonb" })
  partnerIds!: string[];

  @Column({ type: "varchar", length: 20, default: "queued" })
  status!: string;

  @Column({ name: "requested_by", nullable: true })
  requestedBy?: string;

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage?: string;

  @Column({ name: "started_at", type: "timestamp", nullable: true })
  startedAt?: Date;

  @Column({ name: "finished_at", type: "timestamp", nullable: true })
  finishedAt?: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => PartnerAuditLog, (log) => log.job)
  logs!: PartnerAuditLog[];
}