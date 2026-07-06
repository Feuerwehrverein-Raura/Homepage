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
