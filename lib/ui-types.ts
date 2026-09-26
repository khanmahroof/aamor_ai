export type AttachmentView = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
};
export type MessageView = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status?: string;
  model?: string | null;
  position: number;
  attachments?: AttachmentView[];
};
export type ConversationView = {
  id: string;
  title: string;
  selectedModel: string | null;
  updatedAt: string;
};
