export const MANAGED_USER_STATUSES = ["active", "invited", "blocked"] as const;

export type ManagedUserStatus = (typeof MANAGED_USER_STATUSES)[number];

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  profile: string | null;
  responsibilities: string[];
  status: ManagedUserStatus;
  lastAccessAt?: string | null;
};
