import { AuditJob } from "./audit-service";

export type AuditJobWithMetadata = AuditJob & {
  lastCheckedAt?: string | null;
};
