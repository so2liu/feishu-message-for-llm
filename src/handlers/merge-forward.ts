import type {
  Attachment,
  FeishuApiMessage,
  HandlerContext,
  HandlerResult,
} from "../types.js";
import { parseJsonRecord } from "../utils/json.js";

function parseMergeForwardContent(content: unknown): Record<string, unknown> {
  return parseJsonRecord(content) ?? {};
}

async function resolveSenderLabel(
  message: FeishuApiMessage,
  context: HandlerContext,
): Promise<string> {
  const openId = message.sender.id;

  try {
    const { name } = await context.apiClient.getUserInfo(openId);

    return `${name}(${openId})`;
  } catch {
    return `未知用户(${openId})`;
  }
}

function formatQuotedChildMessage(senderLabel: string, text: string): string {
  const lines = text.split("\n");
  const [firstLine = "", ...restLines] = lines;
  const renderedLines =
    firstLine.length > 0
      ? [`**${senderLabel}：** ${firstLine}`, ...restLines]
      : [`**${senderLabel}：**`, ...restLines];

  return renderedLines.map((line) => `> ${line}`).join("\n");
}

export async function handleMergeForward(
  content: unknown,
  context: HandlerContext,
): Promise<HandlerResult> {
  parseMergeForwardContent(content);

  if (context.depth >= 3) {
    return {
      text: "[合并转发消息: 超过最大嵌套深度]",
      attachments: [],
    };
  }

  try {
    const messages = await context.apiClient.getMergeForwardMessages(
      context.messageId,
    );
    const convertedChildren = await Promise.all(
      messages.map(async (message) => {
        const [senderLabel, result] = await Promise.all([
          resolveSenderLabel(message, context),
          context.convertMessageBody(message, context.depth + 1),
        ]);

        return {
          text: formatQuotedChildMessage(senderLabel, result.text),
          attachments: result.attachments,
        };
      }),
    );
    const renderedChildren = convertedChildren.map((child) => child.text);
    const attachments: Attachment[] = convertedChildren.flatMap(
      (child) => child.attachments,
    );

    return {
      text: ["> **合并转发消息：**", ...renderedChildren].join("\n"),
      attachments,
    };
  } catch {
    return {
      text: `[合并转发消息获取失败: ${context.messageId}]`,
      attachments: [],
    };
  }
}
