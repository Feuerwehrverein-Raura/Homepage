import { orderClient } from "./client";
import type {
  WhitelistEntry,
  MyIpResponse,
  WhitelistCheckResponse,
  WhitelistEnabledResponse,
  WhitelistAddRequest,
} from "@/lib/types/whitelist";

export async function getMyIp(): Promise<MyIpResponse> {
  const res = await orderClient.get<MyIpResponse>("/api/whitelist/my-ip");
  return res.data;
}

export async function checkWhitelist(): Promise<WhitelistCheckResponse> {
  const res = await orderClient.get<WhitelistCheckResponse>(
    "/api/whitelist/check"
  );
  return res.data;
}

export async function getWhitelistEnabled(): Promise<WhitelistEnabledResponse> {
  const res = await orderClient.get<WhitelistEnabledResponse>(
    "/api/whitelist/enabled"
  );
  return res.data;
}

export async function setWhitelistEnabled(enabled: boolean): Promise<void> {
  await orderClient.put("/api/whitelist/enabled", { enabled });
}

export async function getWhitelist(): Promise<WhitelistEntry[]> {
  const res = await orderClient.get<WhitelistEntry[]>("/api/whitelist");
  return res.data;
}

export async function addToWhitelist(data: WhitelistAddRequest): Promise<void> {
  await orderClient.post("/api/whitelist", data);
}

export async function removeFromWhitelist(id: string): Promise<void> {
  await orderClient.delete(`/api/whitelist/${id}`);
}
