import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity("partner_drafts")
@Index(["createdById"])
export class PartnerDraft {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", default: "draft" })
  status!: "draft";

  @Column("jsonb", { default: {} })
  payload!: Record<string, any>;

  @Column({ name: "created_by_id", type: "varchar" })
  createdById!: string;

  @Column({ name: "created_by_name", type: "varchar", nullable: true })
  createdByName?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
