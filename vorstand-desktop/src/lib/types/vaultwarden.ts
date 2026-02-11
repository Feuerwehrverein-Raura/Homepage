export interface DecryptedVaultItem {
  id: string;
  type: number;
  name: string;
  subtitle: string | null;
  details: Record<string, string>;
  notes: string | null;
  organizationName: string | null;
  copyFields: Array<{ label: string; value: string }>;
}

export const VAULT_TYPE_LOGIN = 1;
export const VAULT_TYPE_SECURE_NOTE = 2;
export const VAULT_TYPE_CARD = 3;
export const VAULT_TYPE_IDENTITY = 4;
