# feishu-message-for-llm

将飞书消息转换为大模型（LLM）易于理解的 Markdown 格式。

## 为什么需要这个包？

当你用飞书构建 AI 智能体时，飞书推送过来的消息是嵌套的 JSON 结构，包含 `@_user_1` 占位符、`image_key`、`file_key` 等引用 ID。大模型无法直接理解这些原始数据。

本包将飞书消息**一键转为 Markdown**，自动：
- 将 `@_user_1` 替换为 `@张三(ou_xxx)`
- 下载图片、文件、音视频到本地
- 展开回复引用、合并转发中的完整上下文
- 识别飞书文档链接并获取文档标题

**核心原则：不丢失任何信息。** 用户在飞书中能看到的一切，智能体都能完整获取。

## 安装

```bash
npm install feishu-message-for-llm
# 或
pnpm add feishu-message-for-llm
```

## 快速开始

```typescript
import { FeishuMessageConverter } from 'feishu-message-for-llm';

const converter = new FeishuMessageConverter({
  appId: 'cli_xxx',
  appSecret: 'xxx',
  downloadDir: '/data/downloads', // 可选，默认 os.tmpdir()
});

// event 是飞书 WebSocket 推送的 im.message.receive_v1 事件的 event 部分
const result = await converter.convert(event);

console.log(result.markdown);       // 直接给 LLM 的 Markdown
console.log(result.attachments);    // 下载到本地的文件列表
console.log(result.metadata);       // 完整元信息
console.log(result.parentMessage);  // 被回复消息的完整转换结果（如有）
```

## 拉取群聊历史消息

适合把群里最近的聊天作为智能体的上下文：

```typescript
const converter = new FeishuMessageConverter({
  appId: 'cli_xxx',
  appSecret: 'xxx',
  downloadResources: false, // 历史消息不下载文件，只输出占位文本
  maxParentDepth: 2,        // 回复引用最多展开 2 层
});

const { messages, nextPageToken, hasMore } = await converter.fetchChatHistory('oc_xxx', {
  pageSize: 20, // 默认 20，最大 50
});

// messages 按时间升序（最老在前），可直接拼接成上下文
const context = messages.map((m) => m.markdown).join('\n\n');

// 继续往更早翻
if (hasMore) {
  await converter.fetchChatHistory('oc_xxx', { pageToken: nextPageToken });
}
```

- 同一页里被引用的消息直接用页内数据展开，不再单独请求；页内没有才调接口（受 `maxParentDepth` 限制）
- 已撤回的消息输出 `[消息已撤回]`
- 发送人名字优先用群成员列表（按群缓存 5 分钟），查不到再查通讯录
- 本机器人发的消息显示为 `机器人名字(app_id)`，如 `Blade Agent(cli_xxx)`

`fetchChatHistory(chatId, options?)` 的选项：

| 选项 | 说明 |
|------|------|
| `pageSize` | 每页条数，默认 20，最大 50 |
| `pageToken` | 上一页返回的 `nextPageToken` |
| `startTime` / `endTime` | 时间范围，秒级时间戳 |
| `chatType` | `"group"`（默认）或 `"p2p"`；`p2p` 不查群成员列表 |

如果你已经通过飞书消息接口（`im/v1/messages`）拿到了消息条目，可以直接转换：

```typescript
import type { FeishuApiMessage } from 'feishu-message-for-llm';

const result = await converter.convertApiMessage(item as FeishuApiMessage, { chatType: 'group' });
```

## 消息转换对照表

以下展示用户在飞书中看到的消息 vs 智能体收到的 Markdown：

### 基础消息

| 消息类型 | 用户在飞书中看到的 | 智能体收到的 Markdown |
|---------|-------------------|---------------------|
| 文本 | 张三：今天下午开会 | `**张三(ou_abc)：**`<br><br>`今天下午开会` |
| 带@文本 | 张三：@李四 你看一下这个 bug，cc @王五 | `**张三(ou_abc)：**`<br><br>`@李四(ou_def) 你看一下这个 bug，cc @王五(ou_ghi)` |
| 富文本 | 张三：**项目周报**<br>本周完成了 **核心功能**，详见 [设计文档](链接)<br>@李四 请 review | `**张三(ou_abc)：**`<br><br>`### 项目周报`<br><br>`本周完成了 **核心功能**，详见 [设计文档](url)`<br>`@李四(ou_def) 请 review` |

### 媒体和文件

| 消息类型 | 用户在飞书中看到的 | 智能体收到的 Markdown |
|---------|-------------------|---------------------|
| 图片 | 张三：[一张图片] | `**张三(ou_abc)：** ![图片](/tmp/msg_xxx/img_abc.png)` |
| 文件（文本） | 张三：[文件] error.log | `**张三(ou_abc)：** [文件: error.log](/tmp/msg_xxx/error.log)`<br><br>````<error.log 内容>```` <br>````log```` <br>`错误日志内容...` <br>```` ```` <br>````</error.log 内容>```` |
| 文件（二进制） | 张三：[文件] design.psd | `**张三(ou_abc)：** [文件: design.psd](/tmp/msg_xxx/design.psd)` |
| 语音 | 张三：[语音消息] 5秒 | `**张三(ou_abc)：** [语音消息, 时长: 5秒](/tmp/msg_xxx/audio.opus)` |
| 视频 | 张三：[视频] 演示.mp4 00:30 | `**张三(ou_abc)：** [视频: 演示.mp4, 时长: 30秒](/tmp/msg_xxx/演示.mp4)` |
| 贴纸 | 张三：[贴纸] | `**张三(ou_abc)：** [贴纸](/tmp/msg_xxx/sticker.png)` |

### 回复和转发

| 消息类型 | 用户在飞书中看到的 | 智能体收到的 Markdown |
|---------|-------------------|---------------------|
| 回复文本 | 张三 回复 李四：<br>> @王五 这个需求你来做<br>好的，已分配 | `**张三(ou_abc)：**`<br><br>`> 回复 **李四(ou_def)** 的消息：`<br>`> @王五(ou_ghi) 这个需求你来做`<br><br>`好的，已分配` |
| 回复文件 | 张三 回复 李四：<br>> [文件] 接口文档.pdf<br>第三章有问题 | `**张三(ou_abc)：**`<br><br>`> 回复 **李四(ou_def)** 的消息：`<br>`> [文件: 接口文档.pdf](路径)`<br><br>`第三章有问题` |
| 合并转发 | 张三：[合并转发]<br>- 李四：@王五 做这个<br>- 王五：好 | `**张三(ou_abc)：**`<br><br>`> **合并转发消息：**`<br>`> **李四(ou_def)：** @王五(ou_ghi) 做这个`<br>`> **王五(ou_ghi)：** 好` |

### 分享和社交

| 消息类型 | 用户在飞书中看到的 | 智能体收到的 Markdown |
|---------|-------------------|---------------------|
| 分享群聊 | 张三：[群名片] 飞书项目组 | `**张三(ou_abc)：** [分享群聊: 飞书项目组(oc_xxx)]` |
| 分享用户 | 张三：[个人名片] 李四 | `**张三(ou_abc)：** [分享用户: 李四(ou_def)]` |
| 位置 | 张三：[位置] 中关村 | `**张三(ou_abc)：** [位置: 中关村, 经度: 116.31, 纬度: 39.99]` |
| 日程 | 张三：[日程] 项目周会 | `**张三(ou_abc)：** [日程: 项目周会, 开始: 2024-01-01 14:00, 结束: 2024-01-01 15:00]` |

### 其他

| 消息类型 | 用户在飞书中看到的 | 智能体收到的 Markdown |
|---------|-------------------|---------------------|
| 卡片 | 张三：[审批卡片]<br>请假申请<br>[同意] [拒绝] | `**张三(ou_abc)：**`<br>`[卡片消息]`<br>`**请假申请**`<br>`按钮：[同意] [拒绝]` |
| 红包 | 张三：[红包] | `**张三(ou_abc)：** [红包]` |
| 投票 | 张三：[投票] 团建去哪 | `**张三(ou_abc)：**`<br>`[投票: 团建去哪]`<br>`- 三亚`<br>`- 丽江` |
| 任务 | 张三：[任务] 修 bug | `**张三(ou_abc)：** [任务: 修 bug, 截止: 2024-01-05 18:00]` |
| 视频通话 | [视频通话] 项目 sync | `**张三(ou_abc)：** [视频通话: 项目 sync, 开始时间: 2024-01-01 14:00]` |
| 文件夹 | 张三：[文件夹] 设计资料 | `**张三(ou_abc)：** [文件夹: 设计资料]` |
| 未知类型 | — | `**张三(ou_abc)：** [不支持的消息类型: xxx]` |

### 飞书文档链接富化

当消息中包含飞书文档链接时，自动获取文档标题：

| 场景 | 用户看到的 | 智能体收到的 |
|------|-----------|------------|
| 文本中的链接 | 看一下 https://xxx.feishu.cn/docx/abc | `看一下 [需求文档 v2.0](https://xxx.feishu.cn/docx/abc)` |
| 富文本中的链接 | [设计文档](飞书链接) | `[Q1 产品设计文档](https://xxx.feishu.cn/docx/abc)` |

## 支持的消息类型

共 21 种：`text`、`post`、`image`、`file`、`folder`、`audio`、`media`、`sticker`、`share_chat`、`share_user`、`merge_forward`、`interactive`、`hongbao`、`location`、`share_calendar_event`、`calendar`、`general_calendar`、`video_chat`、`todo`、`vote`、`system`

## 配置选项

```typescript
interface ConverterConfig {
  appId: string;        // 飞书应用 App ID
  appSecret: string;    // 飞书应用 App Secret
  downloadDir?: string; // 文件下载目录，默认 os.tmpdir()
  maxFileSize?: number; // 单文件最大下载字节数，超限中断下载
  downloadResources?: boolean; // 是否下载图片、文件等资源，默认 true
  maxParentDepth?: number;     // 回复引用最多展开几层，默认 5；0 表示不展开
}
```

`downloadResources: false` 时不发下载请求、不创建目录、不写文件，`attachments` 为空，资源类消息输出占位文本：

| 消息类型 | 输出 |
|---------|------|
| 图片 | `[图片]` |
| 文件 | `[文件: 接口文档.pdf]`（文本文件也不再内联内容） |
| 语音 | `[语音消息, 时长: 5秒]` |
| 视频 | `[视频: 演示.mp4, 时长: 30秒]` |
| 贴纸 | `[贴纸]` |

合并转发、回复引用里的嵌套消息同样生效。

`maxParentDepth: 0` 时回复消息只输出一行引用：

```markdown
> 回复消息(parent_id: om_xxx)
```

## 返回结构

```typescript
interface ConvertResult {
  markdown: string;             // LLM 可直接使用的 Markdown
  bodyMarkdown: string;         // 不带「**发送人(id)：**」抬头的正文
  attachments: Attachment[];    // 下载到本地的文件列表
  metadata: MessageMetadata;    // 完整元信息（messageId, senderId, chatId 等）
  rawContent: string;           // 原始 content JSON 字符串
  parentMessage?: ConvertResult; // 被回复消息的完整转换结果
}
```

## 关键设计

- **用户标识**：所有用户名统一 `用户名(open_id)` 格式，如 `张三(ou_xxx)`
- **回复引用**：完整转换被回复消息（包括其中的 @提及、附件、合并转发），Markdown 引用块展示
- **合并转发**：递归处理子消息，最大深度 3 层
- **名字缓存**：用户名、群名各最多缓存 2000 条，群成员名单最多缓存 200 个群，超出淘汰最早写入的
- **资源下载**：流式写入文件，不整块载入内存，支持 `maxFileSize` 限制
- **Token 管理**：自动获取、缓存、过期前刷新，并发请求共享同一个刷新 Promise
- **发送人是应用**：本机器人显示为 `机器人名字(app_id)`，其他应用显示为 `应用(app_id)`；没有发送人的系统消息显示为 `系统`
- **降级处理**：用户名获取失败 → `未知用户(open_id)`；下载失败 → 降级文本；JSON 解析失败 → 兜底输出
- **零运行时依赖**：仅使用 Node.js 内置 API

## 要求

- Node.js >= 18
- 飞书应用需要以下权限：
  - `im:message:readonly` — 读取消息
  - `im:resource` — 下载消息中的资源
  - `contact:user.base:readonly` — 获取用户信息
  - `im:chat:readonly` — 获取群聊信息
  - `im:message.group_msg` — 获取群组中所有消息（`fetchChatHistory` 读取非 @ 机器人的群消息时需要）
  - 群成员列表接口 `GET /im/v1/chats/{chat_id}/members` 的读取权限（`fetchChatHistory` 用于解析名字，没有权限时自动改查通讯录）

## 许可证

MIT
