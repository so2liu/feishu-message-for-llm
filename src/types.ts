export interface ConverterConfig {
  appId: string;
  appSecret: string;
  downloadDir?: string;
  maxFileSize?: number;
  /** 是否下载图片、文件等资源，默认 true。为 false 时只输出占位文本，不发请求、不写盘 */
  downloadResources?: boolean;
  /** 回复引用最多向上展开几层，默认 5。0 表示不展开，只输出引用行 */
  maxParentDepth?: number;
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
  thread_id?: string;
  msg_type: string;
  create_time: string;
  update_time: string;
  chat_id: string;
  deleted?: boolean;
  updated?: boolean;
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
    /** open_id；被 @ 的是机器人时为 app_id */
    id: string;
    id_type?: string;
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
  /** 不带「**发送人(id)：**」抬头的正文 */
  bodyMarkdown: string;
  attachments: Attachment[];
  metadata: MessageMetadata;
  rawContent: string;
  parentMessage?: ConvertResult;
}

export type ChatType = "p2p" | "group";

export interface ConvertApiMessageOptions {
  /** 默认 "group" */
  chatType?: ChatType;
}

export interface FetchChatHistoryOptions {
  /** 每页条数，默认 20，最大 50 */
  pageSize?: number;
  /** 上一页返回的 nextPageToken，用于继续往更早翻 */
  pageToken?: string;
  /** 起始时间，秒级时间戳 */
  startTime?: number;
  /** 结束时间，秒级时间戳 */
  endTime?: number;
  /** 默认 "group"；为 "group" 时优先用群成员列表解析发送人名字 */
  chatType?: ChatType;
}

export interface ChatHistoryResult {
  /** 按时间升序排列（最老在前） */
  messages: ConvertResult[];
  nextPageToken?: string;
  hasMore: boolean;
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
  /** 未设置时视为 true */
  downloadResources?: boolean;
  /** 解析合并转发子消息的发送人，返回「名字(id)」 */
  resolveSenderLabel?: (message: FeishuApiMessage) => Promise<string>;
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
