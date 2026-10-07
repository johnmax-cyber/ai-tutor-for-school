export type NotificationType = "reminder" | "mission" | "summary" | "processing_complete";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationInput {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
}
