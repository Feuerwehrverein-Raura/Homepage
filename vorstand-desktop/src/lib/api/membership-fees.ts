import { apiClient } from "./client";
import type {
  MembershipFeePayment,
  MembershipFeeSummary,
  MarkFeePaidRequest,
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
