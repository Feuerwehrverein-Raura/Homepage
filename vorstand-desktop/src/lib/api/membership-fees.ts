import { apiClient } from "./client";
import type {
  MembershipFeePayment,
  MembershipFeeSummary,
  MarkFeePaidRequest,
  MembershipFeeSettings,
  FeeSettingsUpsert,
  GeneratePaymentsResponse,
  SendEmailBulkResponse,
} from "@/lib/types/membership-fee";

export async function listPayments(year: number): Promise<MembershipFeePayment[]> {
  return await apiClient.get<MembershipFeePayment[]>(`/membership-fees/payments?year=${year}`);
}

export async function getSummary(year: number): Promise<MembershipFeeSummary> {
  return await apiClient.get<MembershipFeeSummary>(`/membership-fees/summary?year=${year}`);
}

export async function markPaid(
  id: string,
  body: MarkFeePaidRequest = {}
): Promise<MembershipFeePayment> {
  return await apiClient.patch<MembershipFeePayment>(`/membership-fees/payments/${id}/pay`, body);
}

export async function markUnpaid(id: string): Promise<MembershipFeePayment> {
  return await apiClient.patch<MembershipFeePayment>(`/membership-fees/payments/${id}/unpay`, {});
}

export async function getSettings(year: number): Promise<MembershipFeeSettings | null> {
  try {
    return await apiClient.get<MembershipFeeSettings>(`/membership-fees/settings/${year}`);
  } catch (err) {
    if (err instanceof Error && /404/.test(err.message)) return null;
    throw err;
  }
}

export async function upsertSettings(body: FeeSettingsUpsert): Promise<MembershipFeeSettings> {
  return await apiClient.post<MembershipFeeSettings>(`/membership-fees/settings`, body);
}

export async function generatePayments(
  year: number,
  amount: string
): Promise<GeneratePaymentsResponse> {
  return await apiClient.post<GeneratePaymentsResponse>(`/membership-fees/payments/generate`, {
    year,
    amount,
  });
}

export async function setReference(id: string, referenceNr: string): Promise<MembershipFeePayment> {
  return await apiClient.patch<MembershipFeePayment>(`/membership-fees/payments/${id}/reference`, {
    reference_nr: referenceNr,
  });
}

export async function sendEmailBulk(year: number): Promise<SendEmailBulkResponse> {
  return await apiClient.post<SendEmailBulkResponse>(`/membership-fees/send-email-bulk`, { year });
}
