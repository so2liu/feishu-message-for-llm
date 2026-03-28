export interface ConverterConfig {
  appId: string;
  appSecret: string;
  downloadDir?: string;
  maxFileSize?: number;
}

export interface Mention {
  key: string;
  id: {
    union_id: string;
    user_id: string;
    open_id: string;
  };
  name: string;
  tenant_key: string;
}

export interface FeishuMessageEvent {
  sender: {
    sender_id: {
      union_id: string;
      user_id: string;
      open_id: string;
    };
    sender_type: string;
    tenant_key: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    create_time: string;
    update_time: string;
    chat_id: string;
    thread_id?: string;
    chat_type: "p2p" | "group";
    message_type: string;
    content: string;
    mentions?: Mention[];
    user_agent?: string;
  };
}

export interface FeishuApiMessage {
  message_id: string;
  root_id?: string;
  parent_id?: string;
  msg_type: string;
  create_time: string;
  update_time: string;
  chat_id: string;
  sender: {
    id: string;
    id_type: string;
    sender_type: string;
    tenant_key: string;
  };
  body: {
    content: string;
  };
  mentions?: Array<{
    key: string;
    id: string;
    name: string;
    tenant_key: string;
  }>;
}

export interface Attachment {
  type: "image" | "file" | "audio" | "video" | "sticker";
  filePath: string;
  mimeType?: string;
  fileName?: string;
}

export interface MessageMetadata {
  messageId: string;
  messageType: string;
  chatId: string;
  chatType: "p2p" | "group";
  senderId: string;
  senderName: string;
  senderType: string;
  createTime: string;
  updateTime: string;
  rootId?: string;
  parentId?: string;
  threadId?: string;
  mentions: Array<{
    name: string;
    openId: string;
  }>;
}

export interface ConvertResult {
  markdown: string;
  attachments: Attachment[];
  metadata: MessageMetadata;
  rawContent: string;
  parentMessage?: ConvertResult;
}

export interface FeishuApiClient {
  getTenantAccessToken(): Promise<string>;
  getUserInfo(openId: string): Promise<{ name: string }>;
  getChatInfo(chatId: string): Promise<{ name: string }>;
  getMessage(messageId: string): Promise<FeishuApiMessage>;
  getMergeForwardMessages(messageId: string): Promise<FeishuApiMessage[]>;
  downloadResource(
    messageId: string,
    fileKey: string,
    type: Attachment["type"],
    savePath: string,
    maxSize?: number,
  ): Promise<void>;
  getDocMeta(docToken: string, docType: string): Promise<{ title: string }>;
}

export interface HandlerContext {
  apiClient: FeishuApiClient;
  mentions: Mention[];
  messageId: string;
  messageType: string;
  downloadDir: string;
  maxFileSize?: number;
  convertMessageBody: (
    apiMessage: FeishuApiMessage,
    depth: number,
  ) => Promise<HandlerResult>;
  depth: number;
}

export interface HandlerResult {
  text: string;
  attachments: Attachment[];
}

export type MessageHandler = (
  content: unknown,
  context: HandlerContext,
) => Promise<HandlerResult>;
