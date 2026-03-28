# 代码审查结论

| 文件 | Bug | 安全 | 性能 | 类型安全 | 处理结果 |
| --- | --- | --- | --- | --- | --- |
| `src/types.ts` | 未发现 | 未发现 | 未发现 | 未发现 | 通过 |
| `src/api-client.ts` | 未发现 | 未发现 | 未发现 | 未发现 | 通过 |
| `src/converter.ts` | 未发现 | 未发现 | 未发现 | `ConverterConfig` 缺少运行时校验 | 已修复：校验空 `appId` / `appSecret`、空 `downloadDir`、非正 `maxFileSize` |
| `src/index.ts` | 未发现 | 未发现 | 未发现 | 未发现 | 通过 |
| `src/utils/doc-link.ts` | 未发现 | 未发现 | 文档元数据查询串行执行 | 未发现 | 已修复：去重后并发查询文档标题 |
| `src/utils/json.ts` | 未发现 | 未发现 | 未发现 | 未发现 | 新增：统一安全 JSON 解析 |
| `src/utils/mention.ts` | mention key 前缀重叠时会错误替换 | 未发现 | 未发现 | 未发现 | 已修复：按 key 长度倒序替换 |
| `src/utils/sanitize.ts` | 未发现 | 未发现 | 未发现 | 未发现 | 通过 |
| `src/utils/style.ts` | 未发现 | 未发现 | 未发现 | 未发现 | 通过 |
| `src/utils/text-file.ts` | 未发现 | 未发现 | 未发现 | 未发现 | 通过 |
| `src/utils/time.ts` | 未发现 | 未发现 | 未发现 | 未发现 | 通过 |
| `src/handlers/audio.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
| `src/handlers/calendar.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
| `src/handlers/file.ts` | 非法 JSON 会抛异常 | 未发现 | 文本文件全文读入并原样展开，无预览上限 | 未发现 | 已修复：改为安全 JSON 解析；文本预览限制为 65536 字节；预览失败时保留文件链接 |
| `src/handlers/folder.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
| `src/handlers/hongbao.ts` | 未发现 | 未发现 | 未发现 | 未发现 | 通过 |
| `src/handlers/image.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
| `src/handlers/index.ts` | 未发现 | 未发现 | 未发现 | 未发现 | 通过 |
| `src/handlers/interactive.ts` | 非法 JSON、非法 `card` JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：顶层与嵌套 `card` 均改为安全 JSON 解析 |
| `src/handlers/location.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
| `src/handlers/media.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
| `src/handlers/merge-forward.ts` | 未发现 | 未发现 | 子消息发送者解析与正文转换串行执行 | `attachments` 推断过宽 | 已修复：改为并发处理子消息；补齐 `Attachment[]` 类型 |
| `src/handlers/post.ts` | 非法 JSON 会抛异常 | 嵌入图片/视频下载路径未清洗，存在路径穿越风险 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析；嵌入附件目录与文件名统一清洗并固定扩展名 |
| `src/handlers/share-chat.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
| `src/handlers/share-user.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
| `src/handlers/sticker.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
| `src/handlers/system.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
| `src/handlers/text.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
| `src/handlers/todo.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
| `src/handlers/unknown.ts` | 未发现 | 未发现 | 未发现 | 未发现 | 通过 |
| `src/handlers/video-chat.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
| `src/handlers/vote.ts` | 非法 JSON 会抛异常 | 未发现 | 未发现 | 未发现 | 已修复：改为安全 JSON 解析 |
