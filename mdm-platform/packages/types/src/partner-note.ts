import { z } from "zod";

export const PartnerNoteSchema = z.object({
  id: z.string().uuid(),
  partnerId: z.string().uuid(),
  content: z.string(),
  createdById: z.string().uuid().nullable().optional(),
  createdByName: z.string().nullable().optional(),
  createdAt: z.string()
});

export const PartnerNoteInputSchema = z.object({
  content: z.string().min(1).max(2000)
});

export type PartnerNote = z.infer<typeof PartnerNoteSchema>;
export type PartnerNoteInput = z.infer<typeof PartnerNoteInputSchema>;
