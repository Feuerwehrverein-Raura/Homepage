export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: UserInfo;
}

export interface UserInfo {
  email: string;
  role: string;
  name?: string;
  groups?: string[];
}
