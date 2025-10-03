import { z } from "zod";

export const PartnerAuditDifferenceSchema = z.object({
  field: z.string(),
  label: z.string().optional(),
  before: z.any().nullable().optional(),
  after: z.any().nullable().optional(),
  source: z.enum(["external", "change_request"]),
  metadata: z.record(z.any()).optional()
});

export const PartnerAuditExternalDataSchema = z
  .object({
    source: z.string(),
    fetchedAt: z.string().optional()
  })
  .passthrough();

export const PartnerAuditJobSummarySchema = z
  .object({
    id: z.string().uuid(),
    scope: z.enum(["individual", "massa"]),
    status: z.string(),
    requestedBy: z.string().optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    createdAt: z.string().optional()
  })
  .partial({ status: true });

export const PartnerAuditLogSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  partnerId: z.string().uuid(),
  result: z.enum(["ok", "inconsistente", "erro"]),
  message: z.string().optional(),
  differences: z.array(PartnerAuditDifferenceSchema).nullable().optional(),
  externalData: PartnerAuditExternalDataSchema.nullable().optional(),
  job: PartnerAuditJobSummarySchema.optional(),
  createdAt: z.string()
});

export type PartnerAuditDifference = z.infer<typeof PartnerAuditDifferenceSchema>;
export type PartnerAuditExternalData = z.infer<typeof PartnerAuditExternalDataSchema>;
export type PartnerAuditJobSummary = z.infer<typeof PartnerAuditJobSummarySchema>;
export type PartnerAuditLog = z.infer<typeof PartnerAuditLogSchema>;
