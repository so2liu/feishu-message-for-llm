# 实施计划

- [x] 1. 项目初始化：package.json、tsconfig、tsup、vitest、.gitignore
  - 创建 package.json（ESM/CJS 双入口、exports 条件导出）
  - tsconfig.json（strict、ESM target）
  - tsup.config.ts（ESM + CJS 输出）
  - vitest.config.ts
  - .gitignore
  - _需求：需求 1_

- [x] 2. 类型定义：src/types.ts
  - ConverterConfig、FeishuMessageEvent、FeishuApiMessage
  - Mention、ConvertResult、Attachment、MessageMetadata
  - HandlerContext、HandlerResult、MessageHandler
  - _需求：需求 23/24_

- [x] 3. 工具函数：src/utils/
  - mention.ts：@提及替换（含 @所有人、未匹配保留）
  - style.ts：文本样式处理（bold/italic/underline/lineThrough 叠加）
  - time.ts：时间戳格式化（毫秒 → YYYY-MM-DD HH:mm）
  - text-file.ts：文本文件类型判断
  - sanitize.ts：文件名清洗（跨平台安全）
  - doc-link.ts：飞书云文档链接识别
  - 每个工具函数的单元测试
  - _需求：需求 2/3/22_

- [x] 4. FeishuApiClient：src/api-client.ts
  - Token 自动管理（获取、缓存、并发刷新共享）
  - getUserInfo（带缓存）
  - getChatInfo（带缓存）
  - getMessage（返回 FeishuApiMessage）
  - getMergeForwardMessages
  - downloadResource（流式写入、maxSize 支持）
  - getDocMeta
  - 单元测试（mock fetch）
  - _需求：需求 1_

- [x] 5. 简单消息 Handler：text、hongbao、location、folder、unknown
  - text.ts：文本输出 + @提及替换 + 飞书文档链接富化
  - hongbao.ts：[红包]
  - location.ts：[位置: ...]
  - folder.ts：[文件夹: ...]
  - unknown.ts：[不支持的消息类型: ...]
  - Handler 注册表 handlers/index.ts
  - 每个 handler 的单元测试
  - _需求：需求 2/6/14/15/22_

- [x] 6. 富文本 Handler：post.ts
  - 处理 title + content 二维数组
  - 处理所有 tag 类型：text(含样式叠加)、a(含文档链接富化)、at、img、media、emotion、code_block、hr
  - 单元测试
  - _需求：需求 3_

- [x] 7. 资源下载 Handler：image、file、audio、media、sticker
  - image.ts：下载图片 + ![图片](路径)
  - file.ts：下载文件 + 文本文件自动读取内容
  - audio.ts：下载音频 + 时长格式化
  - media.ts：下载视频 + 封面图 + 时长
  - sticker.ts：下载贴纸
  - 每个 handler 的单元测试
  - _需求：需求 4/5/7/8/9_

- [x] 8. 社交/信息 Handler：share-chat、share-user、calendar、video-chat、todo、vote、system
  - share-chat.ts：获取群名 + chat_id
  - share-user.ts：获取用户名 + open_id
  - calendar.ts：日程 3 种类型统一处理
  - video-chat.ts：视频通话
  - todo.ts：任务（复用 post 解析 summary）
  - vote.ts：投票主题 + 选项
  - system.ts：模板拼接
  - 每个 handler 的单元测试
  - _需求：需求 10/11/16/17/18/19/20_

- [x] 9. 交互卡片 Handler：interactive.ts
  - 递归提取卡片中所有文本内容
  - 处理标题、正文、按钮
  - 模板卡片的 template_id 输出
  - 单元测试
  - _需求：需求 13_

- [x] 10. 合并转发 Handler：merge-forward.ts
  - 调用 getMergeForwardMessages 获取子消息
  - 递归处理每条子消息（使用 convertMessageBody）
  - 深度控制（最大 3 层）
  - 引用块格式输出
  - 单元测试
  - _需求：需求 12_

- [x] 11. Converter 主类：src/converter.ts + src/index.ts
  - convert(event) 主入口
  - 发送者识别（user/app/bot）
  - 回复链递归（visitedIds 防循环、最大深度 5）
  - Content JSON 解析与降级
  - convertApiMessage 适配 REST API 消息
  - 最终 Markdown 组装（发送者 + 引用块 + 内容）
  - index.ts 导出
  - _需求：需求 21/24/25_

- [x] 12. 端到端测试
  - 创建所有消息类型的 fixture JSON
  - 32 个 E2E 测试用例覆盖所有场景
  - Mock fetch 层
  - 临时目录管理
  - _需求：所有需求_

- [x] 13. 构建验证 + 最终检查
  - pnpm build 成功
  - pnpm test 全部通过
  - TypeScript 类型检查通过
  - ESM/CJS 双入口验证
  - _需求：所有需求_
