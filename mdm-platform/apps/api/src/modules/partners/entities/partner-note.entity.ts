import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Partner } from "./partner.entity";

@Entity("partner_notes")
export class PartnerNote {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "partner_id", type: "uuid" })
  partnerId!: string;

  @ManyToOne(() => Partner, (partner) => partner.notes, { onDelete: "CASCADE" })
  partner!: Partner;

  @Column({ type: "text" })
  content!: string;

  @Column({ name: "created_by_id", type: "uuid", nullable: true })
  createdById?: string | null;

  @Column({ name: "created_by_name", type: "varchar", length: 255, nullable: true })
  createdByName?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
