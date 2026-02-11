import { orderClient } from "./client";
import type {
  WhitelistEntry,
  MyIpResponse,
  WhitelistCheckResponse,
  WhitelistEnabledResponse,
  WhitelistAddRequest,
} from "@/lib/types/whitelist";

export async function getMyIp(): Promise<MyIpResponse> {
  return await orderClient.get<MyIpResponse>("/api/whitelist/my-ip");
}

export async function checkWhitelist(): Promise<WhitelistCheckResponse> {
  return await orderClient.get<WhitelistCheckResponse>(
    "/api/whitelist/check"
  );
}

export async function getWhitelistEnabled(): Promise<WhitelistEnabledResponse> {
  return await orderClient.get<WhitelistEnabledResponse>(
    "/api/whitelist/enabled"
  );
}

export async function setWhitelistEnabled(enabled: boolean): Promise<void> {
  await orderClient.put("/api/whitelist/enabled", { enabled });
}

export async function getWhitelist(): Promise<WhitelistEntry[]> {
  return await orderClient.get<WhitelistEntry[]>("/api/whitelist");
}

export async function addToWhitelist(data: WhitelistAddRequest): Promise<void> {
  await orderClient.post("/api/whitelist", data);
}

export async function removeFromWhitelist(id: string): Promise<void> {
  await orderClient.delete(`/api/whitelist/${id}`);
}
