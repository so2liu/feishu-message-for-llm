# 需求文档

## 简介

`feishu-message-for-llm` 是一个 NPM 包，用于将飞书消息（通过 WebSocket 长连接接收的 `im.message.receive_v1` 事件）转换为 Markdown 格式的文本，使大语言模型（LLM）能够直接理解和处理。

**核心原则：不丢失任何信息。** 用户在飞书中能看到的所有信息——包括发送者、被 @的人、引用的消息、引用消息中被 @的人、文件名、时长、位置等——智能体都必须完整获取到。缺少任何一条信息都可能导致智能体误解用户意图。

## 全局规则

- **用户标识统一格式**：所有出现用户名的地方，统一输出 `用户名(open_id)` 格式，如 `张三(ou_xxxxx)`。获取失败时降级为 `未知用户(ou_xxxxx)`
- **下载目录可配置**：所有文件下载的目标目录默认为 `/tmp`，开发者可在初始化时通过 `downloadDir` 参数配置
- **文件下载路径**：下载的文件存放在 `{downloadDir}/{message_id}/` 子目录下，避免冲突
- **信息完整性**：对任何消息类型，所有原始字段信息都不能丢弃，即使 Markdown 中不直接展示，也要保留在 metadata 或 rawContent 中

## 需求

---

### 需求 1 - 包初始化与配置

**用户故事：** 作为开发者，我想要通过 AppID 和 AppSecret 初始化该包，并可配置下载目录等参数。

#### 验收标准

1. 当开发者传入 `appId` 和 `appSecret` 时，包应该自动获取并管理 `tenant_access_token`（含自动刷新）
2. 当 token 过期时，包应该在下次 API 调用前自动刷新 token，无需开发者干预
3. 当 `appId` 或 `appSecret` 缺失或无效时，包应该抛出明确的错误信息
4. 开发者可传入 `downloadDir` 参数指定文件下载目录，默认为 `/tmp`

---

### 需求 2 - 文本消息转换

**用户故事：** 作为开发者，我想要将飞书纯文本消息转为 Markdown，LLM 能直接阅读并理解谁说了什么、@了谁。

#### 场景示例

**场景 2a：普通文本**

飞书原始数据：
```json
{
  "message_type": "text",
  "content": "{\"text\":\"今天下午开会\"}",
  "mentions": []
}
```

用户在飞书中看到的：
> 张三：今天下午开会

智能体收到的 Markdown：
```
**张三(ou_abc123)：** 今天下午开会
```

**场景 2b：带 @提及的文本**

飞书原始数据：
```json
{
  "message_type": "text",
  "content": "{\"text\":\"@_user_1 你看一下这个 bug，cc @_user_2\"}",
  "mentions": [
    {"key": "@_user_1", "name": "李四", "id": {"open_id": "ou_def456"}},
    {"key": "@_user_2", "name": "王五", "id": {"open_id": "ou_ghi789"}}
  ]
}
```

用户在飞书中看到的：
> 张三：@李四 你看一下这个 bug，cc @王五

智能体收到的 Markdown：
```
**张三(ou_abc123)：** @李四(ou_def456) 你看一下这个 bug，cc @王五(ou_ghi789)
```

#### 验收标准

1. 当收到 `message_type: "text"` 的消息时，包应该将 content 中的文本直接输出
2. 当文本中包含 `@_user_N` 占位符时，包应该根据 `mentions` 数组将其替换为 `@用户名(open_id)` 的格式
3. Markdown 输出开头必须包含发送者标识 `**发送者名(open_id)：**`

---

### 需求 3 - 富文本（Post）消息转换

**用户故事：** 作为开发者，我想要将飞书富文本消息转为 Markdown，保留所有格式、链接、@提及和嵌入的媒体。

#### 场景示例

**场景 3a：带格式和链接的富文本**

飞书原始数据（content 解析后）：
```json
{
  "title": "项目周报",
  "content": [
    [
      {"tag": "text", "text": "本周完成了 ", "style": []},
      {"tag": "text", "text": "核心功能", "style": ["bold"]},
      {"tag": "text", "text": " 的开发，详见 "},
      {"tag": "a", "text": "设计文档", "href": "https://xxx.feishu.cn/docs/xxx"}
    ],
    [
      {"tag": "at", "user_id": "@_user_1", "user_name": "李四"},
      {"tag": "text", "text": " 请 review 一下"}
    ]
  ]
}
```

用户在飞书中看到的：
> **项目周报**
> 本周完成了 **核心功能** 的开发，详见 [设计文档](链接)
> @李四 请 review 一下

智能体收到的 Markdown：
```
**张三(ou_abc123)：**

### 项目周报

本周完成了 **核心功能** 的开发，详见 [设计文档](https://xxx.feishu.cn/docs/xxx)
@李四(ou_def456) 请 review 一下
```

**场景 3b：带图片和代码的富文本**

用户在飞书中看到的：
> 张三：bug 截图如下：
> [一张截图]
> 错误日志：
> ```
> Error: Connection refused
> ```

智能体收到的 Markdown：
```
**张三(ou_abc123)：**

bug 截图如下：
![图片](/tmp/msg_xxx/image_abc.png)
错误日志：
```
Error: Connection refused
```
```

#### 验收标准

1. 当收到 `message_type: "post"` 的消息时，包应该将标题转为 Markdown 标题
2. `text` tag：输出纯文本，并根据 `style` 数组处理样式：
   - `bold` → `**文本**`
   - `italic` → `*文本*`
   - `underline` → `<u>文本</u>`
   - `lineThrough` → `~~文本~~`
   - 多种样式可叠加（如 bold+italic → `***文本***`）
3. `a` tag：输出 `[链接文字](url)` 格式，同样处理 style
4. `at` tag：输出 `@用户名(open_id)` 格式（从 mentions 中匹配 open_id）
5. `img` tag：使用 `image_key` 下载图片到本地，输出 `![图片](本地路径)`
6. `media` tag：使用 `file_key` 下载视频到本地，输出 `[视频](本地路径)`，如有 `image_key` 同时下载封面
7. `emotion` tag：输出 `:{emoji_type}:` 格式
8. `code_block` tag：输出 Markdown 代码块，标注 `language`
9. `hr` tag：输出 `---` 分隔线
10. 多个段落（content 二维数组的第一层）用换行分隔

---

### 需求 4 - 图片消息转换

**用户故事：** 作为开发者，我想要将飞书图片消息下载到本地，LLM 能看到图片内容。

#### 场景示例

飞书原始数据：
```json
{
  "message_type": "image",
  "content": "{\"image_key\":\"img_v2_abc123\"}"
}
```

用户在飞书中看到的：
> 张三：[一张图片]

智能体收到的 Markdown：
```
**张三(ou_abc123)：** ![图片](/tmp/msg_xxx/img_v2_abc123.png)
```

#### 验收标准

1. 当收到 `message_type: "image"` 的消息时，使用 `image_key` 通过飞书 API 下载图片到 `{downloadDir}/{message_id}/`
2. 输出 `![图片](本地文件路径)` 格式
3. 当下载失败时，输出 `[图片下载失败: {image_key}]` 的降级文本

---

### 需求 5 - 文件消息转换

**用户故事：** 作为开发者，我想要将飞书文件消息下载，文本文件的内容自动读取给 LLM。

#### 场景示例

**场景 5a：文本文件**

飞书原始数据：
```json
{
  "message_type": "file",
  "content": "{\"file_key\":\"file_abc\",\"file_name\":\"error.log\"}"
}
```

用户在飞书中看到的：
> 张三：[文件] error.log

智能体收到的 Markdown：
```
**张三(ou_abc123)：** [文件: error.log](/tmp/msg_xxx/error.log)

<error.log 内容>
```log
2024-01-01 10:00:00 ERROR Connection timeout
2024-01-01 10:00:01 ERROR Retry failed
```
</error.log 内容>
```

**场景 5b：二进制文件**

智能体收到的 Markdown：
```
**张三(ou_abc123)：** [文件: design.psd](/tmp/msg_xxx/design.psd)
```

#### 验收标准

1. 当收到 `message_type: "file"` 的消息时，下载文件到 `{downloadDir}/{message_id}/`
2. 输出 `[文件: {file_name}](本地文件路径)`
3. 当文件是文本类文件（.txt, .md, .json, .csv, .log, .xml, .yaml, .yml 等）时，自动读取内容并以代码块形式附加

---

### 需求 6 - 文件夹消息转换

**用户故事：** 作为开发者，我想要将飞书文件夹消息转为可读描述。

#### 验收标准

1. 当收到 `message_type: "folder"` 的消息时，输出 `[文件夹: {file_name}]`

---

### 需求 7 - 音频消息转换

**用户故事：** 作为开发者，我想要将飞书音频消息下载并提供时长信息。

#### 场景示例

飞书原始数据：
```json
{
  "message_type": "audio",
  "content": "{\"file_key\":\"file_abc\",\"duration\":5000}"
}
```

用户在飞书中看到的：
> 张三：[语音消息] 5秒

智能体收到的 Markdown：
```
**张三(ou_abc123)：** [语音消息, 时长: 5秒](/tmp/msg_xxx/audio_file_abc.opus)
```

#### 验收标准

1. 当收到 `message_type: "audio"` 的消息时，下载音频到 `{downloadDir}/{message_id}/`
2. 输出 `[语音消息, 时长: {duration/1000}秒](本地文件路径)`

---

### 需求 8 - 视频消息转换

**用户故事：** 作为开发者，我想要将飞书视频消息下载并提供完整信息。

#### 场景示例

飞书原始数据：
```json
{
  "message_type": "media",
  "content": "{\"file_key\":\"file_abc\",\"image_key\":\"img_cover\",\"file_name\":\"演示.mp4\",\"duration\":30000}"
}
```

用户在飞书中看到的：
> 张三：[视频] 演示.mp4 00:30

智能体收到的 Markdown：
```
**张三(ou_abc123)：** [视频: 演示.mp4, 时长: 30秒](/tmp/msg_xxx/演示.mp4)
```

#### 验收标准

1. 当收到 `message_type: "media"` 的消息时，下载视频到 `{downloadDir}/{message_id}/`
2. 输出 `[视频: {file_name}, 时长: {duration/1000}秒](本地文件路径)`
3. 当有封面图（image_key）时，同时下载封面图

---

### 需求 9 - 贴纸消息转换

#### 验收标准

1. 当收到 `message_type: "sticker"` 的消息时，下载贴纸图片到本地
2. 输出 `[贴纸](/tmp/msg_xxx/sticker_xxx.png)`

---

### 需求 10 - 分享群聊卡片转换

#### 场景示例

飞书原始数据：
```json
{
  "message_type": "share_chat",
  "content": "{\"chat_id\":\"oc_abc123\"}"
}
```

用户在飞书中看到的：
> 张三：[群名片] 飞书项目组

智能体收到的 Markdown：
```
**张三(ou_abc123)：** [分享群聊: 飞书项目组(oc_abc123)]
```

#### 验收标准

1. 当收到 `message_type: "share_chat"` 的消息时，通过 `chat_id` 调用飞书 API 获取群聊名称
2. 输出 `[分享群聊: {群聊名称}({chat_id})]`
3. 获取失败时降级输出 `[分享群聊: {chat_id}]`

---

### 需求 11 - 分享用户卡片转换

#### 场景示例

飞书原始数据：
```json
{
  "message_type": "share_user",
  "content": "{\"user_id\":\"ou_def456\"}"
}
```

用户在飞书中看到的：
> 张三：[个人名片] 李四

智能体收到的 Markdown：
```
**张三(ou_abc123)：** [分享用户: 李四(ou_def456)]
```

#### 验收标准

1. 当收到 `message_type: "share_user"` 的消息时，通过 `user_id`（open_id）调用飞书 API 获取用户名称
2. 输出 `[分享用户: {用户名}({open_id})]`
3. 获取失败时降级输出 `[分享用户: 未知用户({open_id})]`

---

### 需求 12 - 合并转发消息转换

**用户故事：** 作为开发者，我想要将合并转发中的每一条子消息都完整展示给 LLM，包括每条子消息中的 @、引用、附件等所有信息。

#### 场景示例

用户在飞书中看到的：
> 张三：[合并转发]
> - 李四：@王五 这个需求你来做
> - 王五：好的，我看一下设计文档
> - 李四：[图片]

智能体收到的 Markdown：
```
**张三(ou_abc123)：**

> **合并转发消息：**
> **李四(ou_def456)：** @王五(ou_ghi789) 这个需求你来做
> **王五(ou_ghi789)：** 好的，我看一下设计文档
> **李四(ou_def456)：** ![图片](/tmp/msg_xxx/img_abc.png)
```

#### 验收标准

1. 当收到 `message_type: "merge_forward"` 的消息时，调用飞书 API 获取合并转发中的子消息列表
2. 递归处理每条子消息（复用其他消息类型的转换逻辑，保留所有 @提及、附件等信息），以引用块格式输出
3. 当子消息中又包含合并转发时，递归处理（最大深度 3 层）

---

### 需求 13 - 交互卡片消息转换

#### 场景示例

用户在飞书中看到的：
> 张三：[一个审批卡片]
> 标题：请假申请
> 申请人：李四
> 请假时间：3月28日-3月29日
> [同意] [拒绝]

智能体收到的 Markdown：
```
**张三(ou_abc123)：**

[卡片消息]
**请假申请**
申请人：李四
请假时间：3月28日-3月29日
按钮：[同意] [拒绝]
```

#### 验收标准

1. 当收到 `message_type: "interactive"` 的消息时，递归提取卡片中所有文本内容（标题、正文、按钮文字等）
2. 将卡片转为结构化的 Markdown 输出，保留层级关系
3. 当卡片使用模板时，输出 `[卡片消息: template_id]` 并附带所有可提取的文本

---

### 需求 14 - 红包消息转换

#### 验收标准

1. 当收到 `message_type: "hongbao"` 的消息时，输出 `[红包]`

---

### 需求 15 - 位置消息转换

#### 场景示例

飞书原始数据：
```json
{
  "message_type": "location",
  "content": "{\"name\":\"北京市海淀区中关村\",\"longitude\":\"116.310003\",\"latitude\":\"39.991957\"}"
}
```

智能体收到的 Markdown：
```
**张三(ou_abc123)：** [位置: 北京市海淀区中关村, 经度: 116.310003, 纬度: 39.991957]
```

#### 验收标准

1. 当收到 `message_type: "location"` 的消息时，输出 `[位置: {name}, 经度: {longitude}, 纬度: {latitude}]`

---

### 需求 16 - 日程消息转换

#### 场景示例

智能体收到的 Markdown：
```
**张三(ou_abc123)：** [日程: 项目周会, 开始: 2024-01-01 14:00, 结束: 2024-01-01 15:00]
```

#### 验收标准

1. 当收到 `message_type` 为 `share_calendar_event`、`calendar` 或 `general_calendar` 的消息时，输出 `[日程: {summary}, 开始: {格式化时间}, 结束: {格式化时间}]`
2. 时间戳（毫秒）格式化为 `YYYY-MM-DD HH:mm` 格式

---

### 需求 17 - 视频通话消息转换

#### 验收标准

1. 当收到 `message_type: "video_chat"` 的消息时，输出 `[视频通话: {topic}, 开始时间: {格式化时间}]`

---

### 需求 18 - 任务消息转换

#### 场景示例

智能体收到的 Markdown：
```
**张三(ou_abc123)：** [任务: 修复登录页 bug, 截止: 2024-01-05 18:00]
```

#### 验收标准

1. 当收到 `message_type: "todo"` 的消息时，提取 `summary`（富文本格式，复用 Post 转换逻辑）
2. 输出 `[任务: {summary文本}, 截止: {格式化时间}]`

---

### 需求 19 - 投票消息转换

#### 场景示例

智能体收到的 Markdown：
```
**张三(ou_abc123)：**

[投票: 团建去哪里]
- 三亚
- 丽江
- 西双版纳
```

#### 验收标准

1. 当收到 `message_type: "vote"` 的消息时，输出投票主题和所有选项

---

### 需求 20 - 系统消息转换

#### 验收标准

1. 当收到 `message_type: "system"` 的消息时，根据 `template` 和变量值拼接出完整文本
2. 输出 `[系统消息: {拼接后的文本}]`

---

### 需求 21 - 回复/引用消息处理

**用户故事：** 作为开发者，我想要在用户回复某条消息时，完整保留被回复消息的所有上下文（包括被回复消息中的 @提及、附件等），让 LLM 能理解完整对话链。

#### 场景示例

**场景 21a：回复文本消息**

用户在飞书中看到的：
> | 张三 回复了 李四 的消息
> | > @王五 这个需求你来做
> | 好的，我已经分配给王五了

智能体收到的 Markdown：
```
**张三(ou_abc123)：**

> 回复 **李四(ou_def456)** 的消息：
> @王五(ou_ghi789) 这个需求你来做

好的，我已经分配给王五了
```

**场景 21b：回复图片消息**

用户在飞书中看到的：
> | 张三 回复了 李四 的消息
> | > [一张截图]
> | 这个 bug 我看到了

智能体收到的 Markdown：
```
**张三(ou_abc123)：**

> 回复 **李四(ou_def456)** 的消息：
> ![图片](/tmp/msg_parent_xxx/img_abc.png)

这个 bug 我看到了
```

**场景 21c：回复文件消息**

用户在飞书中看到的：
> | 张三 回复了 李四 的消息
> | > [文件] 接口文档.pdf
> | 这个文档里第三章的接口定义有问题

智能体收到的 Markdown：
```
**张三(ou_abc123)：**

> 回复 **李四(ou_def456)** 的消息：
> [文件: 接口文档.pdf](/tmp/msg_parent_xxx/接口文档.pdf)

这个文档里第三章的接口定义有问题
```

**场景 21d：回复合并转发消息**

用户在飞书中看到的：
> | 张三 回复了 李四 的消息
> | > [合并转发] 3条消息
> | 我已经看完了这些聊天记录

智能体收到的 Markdown：
```
**张三(ou_abc123)：**

> 回复 **李四(ou_def456)** 的消息：
> > **合并转发消息：**
> > **王五(ou_ghi789)：** 明天开会
> > **赵六(ou_jkl012)：** 好的
> > **王五(ou_ghi789)：** 带上设计稿

我已经看完了这些聊天记录
```

#### 验收标准

1. 当消息包含 `parent_id` 时，通过飞书 API 拉取被回复的原始消息
2. 被回复的消息应**完整转换**（复用对应消息类型的转换逻辑，包括其中的 @提及、图片下载、合并转发展开等），作为 Markdown 引用块输出，置于当前消息内容之前
3. 引用块开头标明被回复消息的发送者：`> 回复 **用户名(open_id)** 的消息：`
4. 当拉取被回复消息失败时，降级输出 `> 回复消息(parent_id: {parent_id})`

---

### 需求 22 - 飞书云文档链接识别与富化

**用户故事：** 作为开发者，我想要当消息中包含飞书云文档链接时，自动识别并获取文档标题，让 LLM 知道用户分享的是什么文档。

#### 场景示例

**场景 22a：文本消息中包含飞书文档链接**

用户在飞书中看到的：
> 张三：你看一下这个需求文档 https://xxx.feishu.cn/docx/abc123

智能体收到的 Markdown：
```
**张三(ou_abc123)：** 你看一下这个需求文档 [需求文档 v2.0](https://xxx.feishu.cn/docx/abc123)
```

**场景 22b：富文本中的飞书文档链接**

用户在飞书中看到的：
> 张三：参考 [设计文档](飞书链接) 和 [数据表](飞书链接)

智能体收到的 Markdown：
```
**张三(ou_abc123)：** 参考 [Q1 产品设计文档](https://xxx.feishu.cn/docx/abc) 和 [用户数据统计表](https://xxx.feishu.cn/sheets/def)
```

**场景 22c：回复消息中被引用的消息里包含飞书文档链接**

用户在飞书中看到的：
> | 张三 回复了 李四 的消息
> | > @王五 看一下这个 https://xxx.feishu.cn/wiki/abc
> | 我已经 review 完了，LGTM

智能体收到的 Markdown：
```
**张三(ou_abc123)：**

> 回复 **李四(ou_def456)** 的消息：
> @王五(ou_ghi789) 看一下这个 [API 设计规范](https://xxx.feishu.cn/wiki/abc)

我已经 review 完了，LGTM
```

#### 验收标准

1. 包应识别消息文本中的飞书云文档 URL 模式（匹配 `*.feishu.cn/docx/*`、`*.feishu.cn/sheets/*`、`*.feishu.cn/wiki/*`、`*.feishu.cn/base/*`、`*.feishu.cn/mindnotes/*`、`*.feishu.cn/slides/*` 等）
2. 对识别到的链接，通过飞书 API 获取文档标题
3. 在 Markdown 中将裸 URL 替换为 `[文档标题](URL)` 格式；对已经是 `[文字](URL)` 格式的链接，将文字替换为实际文档标题
4. 当获取文档标题失败时，保持原始 URL 或原始链接文字不变
5. 此逻辑在所有消息类型的文本处理中生效（text、post、回复引用中的消息、合并转发中的消息等）

---

### 需求 23 - 未知消息类型兜底

#### 验收标准

1. 当收到未识别的 `message_type` 时，输出 `[不支持的消息类型: {type}]`
2. 返回结果中保留原始 JSON（`rawContent` 字段），方便调用方自行处理

---

### 需求 24 - 返回结果结构

**用户故事：** 作为开发者，我想要获得结构清晰的转换结果，包含 Markdown 文本、附件文件路径和完整元信息。

#### 验收标准

1. 包应该返回统一结构的结果对象，包含：
   - `markdown`: string — LLM 可直接使用的 Markdown 文本（含发送者标识、回复引用、消息内容，所有 @提及都带 open_id）
   - `attachments`: 数组 — 下载到本地的文件列表 `[{type, filePath, mimeType}]`
   - `metadata`: 对象 — 完整的原始消息元信息：
     - `messageId`: string
     - `messageType`: string
     - `chatId`: string
     - `chatType`: "p2p" | "group"
     - `senderId`: string (open_id)
     - `senderName`: string
     - `createTime`: string (毫秒时间戳)
     - `updateTime`: string (毫秒时间戳)
     - `rootId`: string | undefined（话题根消息）
     - `parentId`: string | undefined（回复的消息）
     - `threadId`: string | undefined（话题 ID）
     - `mentions`: 数组 — 被提及的用户列表 `[{name, openId}]`
   - `rawContent`: string — 原始 content JSON 字符串
2. 当消息不包含附件时，`attachments` 应为空数组

---

### 需求 25 - 消息发送者信息

**用户故事：** 作为开发者，我想要在每条消息的 Markdown 输出中包含发送者的完整标识。

#### 验收标准

1. 包应该通过 sender 的 open_id 调用飞书 API 获取用户名称
2. Markdown 输出的最开头应包含发送者标识：`**张三(ou_xxx)：**`
3. 当获取用户信息失败时，降级为 `**未知用户(ou_xxx)：**`
