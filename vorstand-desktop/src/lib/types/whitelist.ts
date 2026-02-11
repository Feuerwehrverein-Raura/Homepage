export interface WhitelistEntry {
  id: string;
  ip_address: string;
  device_name: string | null;
  created_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  is_permanent: boolean;
}

export interface MyIpResponse {
  ip: string;
}

export interface WhitelistCheckResponse {
  ip: string;
  whitelisted: boolean;
  device_name: string | null;
  expires_at: string | null;
  is_permanent: boolean | null;
}

export interface WhitelistEnabledResponse {
  enabled: boolean;
}

export interface WhitelistAddRequest {
  ipAddress: string;
  deviceName?: string;
}
