import { apiClient } from "./client";

export interface BroadcastPushResponse {
  success: boolean;
  sent: number | null;
}

// Push-Broadcast an alle Mitglieder mit App + aktivierten Benachrichtigungen
// (FCM-Channel "general"). E-Mail/Post laufen separat.
export async function broadcastPush(
  title: string,
  body: string
): Promise<BroadcastPushResponse> {
  return await apiClient.post<BroadcastPushResponse>("/push/broadcast", {
    title,
    body,
  });
}

export interface NotifyMembersResponse {
  success: boolean;
  pushed: number;
  emailed: number;
}

// Gezielte Benachrichtigung an ausgewaehlte Mitglieder (per member_id).
// Sendet einen Push an die App der genannten Mitglieder und optional
// zusaetzlich eine E-Mail.
export async function notifyMembers(
  memberIds: string[],
  title: string,
  body: string,
  alsoEmail: boolean
): Promise<NotifyMembersResponse> {
  return await apiClient.post<NotifyMembersResponse>("/push/to-members", {
    memberIds,
    title,
    body,
    alsoEmail,
  });
}
