import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Partner } from "./partner.entity";

@Entity("partner_change_requests")
export class PartnerChangeRequest {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "partner_id" })
  partnerId!: string;

  @ManyToOne(() => Partner, (partner) => partner.changeRequests, { onDelete: "CASCADE" })
  partner!: Partner;

  @Column({ name: "request_type", type: "varchar", length: 20 })
  requestType!: "individual" | "massa" | "auditoria";

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  payload!: Record<string, any>;

  @Column({ type: "varchar", length: 30, default: "pendente" })
  status!: string;

  @Column({ type: "text", nullable: true })
  motivo?: string;

  @Column({ name: "requested_by", nullable: true })
  requestedBy?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}