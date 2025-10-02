export type StoredUser = {
  id: string;
  email: string;
  name?: string | null;
  profile?: string | null;
  responsibilities?: string[];
};

export const USER_STORAGE_KEY = "mdmUser";

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredUser;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to parse stored user", error);
  }
  return null;
}

export function storeUser(user: StoredUser | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (!user) {
    window.localStorage.removeItem(USER_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}
