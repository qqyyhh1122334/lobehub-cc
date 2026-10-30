# SaaS 移除与本地执行验收

基线：`049c81d53b0c2282eabf1edca2d90d58ad1f60f0`（v2.2.1）。本文件只说明 SaaS 清理与本地队列的验证范围；完整网络隔离、浏览器和容器验收见其他部署文档。

## 功能处理

| 功能                               | 内网版本行为                                                                                    | 兼容性说明                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Klavis                             | 删除 SDK；服务目录为空；旧安装记录不再向模型提供工具；调用明确返回 `INTRANET_FEATURE_DISABLED`  | `KLAVIS_API_KEY` 无法重新启用                                                 |
| QStash / Upstash Workflow          | 删除 SDK 和云队列/云调度实现；旧客户端引用立即失败；云回调返回 HTTP 410                         | 不用普通 fetch 偷换云服务的重试/持久化语义                                    |
| 自动记忆批处理与云评测             | 入口在修改任务状态前拒绝；旧 HTTP 批处理/评测/回调路由返回 410                                  | 保留数据库中已有记忆的读取与基础本地提取工具；云工作流不会被假装调度成功      |
| Vercel Edge Config                 | 使用本地环境变量 `INTRANET_EDGE_CONFIG_JSON`                                                    | 旧 Vercel URL 不会触发连接；非 JSON 对象报错                                  |
| Agent 云网关/公共机器人/OAuth 回调 | `/api/agent/run`、`gateway`、`webhooks`、`messenger` 云入口返回 410                             | 本地 `/api/agent` 仍要求 `AGENT_EXEC_API_KEY`；内部工具结果使用原服务令牌鉴权 |
| Market 身份桥接                    | OIDC GET/POST 返回 410；trusted-client 与身份中间件不读取用户、会话、数据库，也不生成云令牌 | 旧 client/secret 配置无法重新启用                                           |
| 云 Bot 渠道与消息工具               | 平台注册表为空，不导入云适配器；31 个旧渠道/消息路由在解析输入和访问数据库前拒绝；消息工具工厂明确失败 | 保留请求/响应类型与已有数据库记录；不发送消息、不验证公网凭据、不生成登录二维码 |
| Agent 本地队列                     | 只调用进程内执行回调；计入待执行/执行中/成功/失败；支持取消尚未执行的定时器                     | 不连接公网队列；已进入执行的任务由 AgentRuntime 中断机制停止                  |
| Cron 日历任务                      | 禁止新建、修改为 cron 和启动旧 cron 任务；转换为 heartbeat/手动时清除旧 cron 字段；保留历史记录 | 云 dispatcher 已删除，不能返回虚假的调度成功                                  |
| 本地 task scheduler                | 只使用进程内定时器；ID 防止同毫秒冲突；取消不影响其他定时器                                     | 无跨进程、跨重启持久化保证                                                    |

## 已执行检查

2026-10-29 在 Node 24.22.1 执行：

```bash
node --test tests/intranet/saas-offline.test.mjs tests/intranet/local-queue.test.mjs
```

结果：**32 个测试通过，0 失败、0 跳过**。

| 检查                                               | 证据                                                    | 结果         |
| -------------------------------------------------- | ------------------------------------------------------- | ------------ |
| 即使提供旧 QStash / Klavis 凭据仍拒绝启动云功能    | 加载真实 TypeScript 模块并断言错误码                    | 通过         |
| SaaS API 拒绝期间不调用 fetch                      | 记录全局 fetch 调用次数，期望 0                         | 通过         |
| 退休的云回调不会读取输入或访问数据库               | 逐一直接调用 14 个实际 route.ts 导出的 POST，不提供请求 | 全部返回 410 |
| 旧 Vercel 配置 URL 不启用远程配置                  | 设置旧环境变量后检查本地 EdgeConfig                     | 通过         |
| 本地 JSON 配置合法/非法分支                        | 真模块读取本地值；数组配置拒绝                          | 通过         |
| 本地队列取消、并发 ID、待执行/执行中/成功/失败计数 | 实际定时器与真实模块；只替换无关 debug logger           | 通过         |
| 本地调度器单独取消重复 task ID                     | 两个真实定时器，取消一个后只执行另一个                  | 通过         |
| 无效/溢出延时不会立即执行任务                      | 拒绝负数、NaN、Infinity、Node 定时器上界以外的值        | 通过         |

额外检查：变更中的 32 个 TypeScript 模块已完成语法转换检查；`git diff --check` 通过。语法检查不等于 TypeScript 类型检查，也不等于完整构建。

## 已执行的 Vitest 检查

已执行 **25 个测试文件、218 个测试，全部通过**：SaaS/env/队列/HTTP/身份桥接与云 Bot 边界 136 个，任务服务、迁移更新与 heartbeat 生命周期 65 个，记忆运行参数与输入处理 14 个，本地 EdgeConfig 3 个。执行时直接调用已安装的 `node_modules/vitest/vitest.mjs`，避免宿主机 pnpm wrapper 自动启动不同版本的依赖安装。

以下为常规 pnpm 10.33.0 环境下可复现的主要验收入口；**这些测试仍不能替代完整应用集成验收**：

```bash
pnpm exec vitest run --silent=passed-only \
  src/envs/__tests__/app.test.ts \
  src/libs/intranet/disabled.test.ts \
  src/libs/intranet/taskPolicy.test.ts \
  src/libs/qstash/index.test.ts \
  src/libs/klavis/index.test.ts \
  src/libs/trusted-client/index.test.ts \
  src/libs/trpc/lambda/middleware/marketUserInfo.test.ts \
  'src/app/(backend)/market/oidc/[[...segments]]/route.test.ts' \
  src/server/services/klavis/index.test.ts \
  src/server/services/queue/impls/local.test.ts \
  src/server/services/queue/__tests__/QueueService.test.ts \
  src/server/services/taskScheduler/impls/local.test.ts \
  src/server/agent-hono/middlewares/__tests__/bearerSecretAuth.test.ts \
  src/server/agent-hono/index.test.ts \
  src/server/routers/lambda/__tests__/userMemory.test.ts \
  src/server/routers/lambda/__tests__/task.intranet.test.ts \
  src/server/routers/lambda/__tests__/bot.intranet.test.ts \
  src/server/services/toolExecution/serverRuntimes/__tests__/message.test.ts
pnpm exec vitest run --maxWorkers=2 \
  src/server/services/task/index.test.ts \
  src/server/services/taskLifecycle/heartbeatRearm.test.ts \
  src/server/services/taskLifecycle/onTopicComplete.test.ts \
  src/server/services/taskRunner/scheduleTick.test.ts \
  src/server/services/memory/userMemory/__tests__/extract.runtime.test.ts \
  src/server/services/memory/userMemory/__tests__/extract.payload.test.ts
pnpm exec vitest run --config packages/edge-config/vitest.config.mts
pnpm run type-check
```

主构建、数据库迁移、用户登录、聊天流式响应、文件上传/下载、重启恢复以及容器无公网路由的集成验证应由总体部署验收记录给出结果。本文件不宣称这些步骤已完成。

## 已知边界

- 本地队列与 task scheduler 是进程内执行机制。进程崩溃、容器重启会丢失尚未执行的定时器；不能等同于 QStash 的持久化队列。需要定时任务持久化时，必须另行实现内网持久化 worker 与重启恢复机制后验收。
- Node 定时器可表达的最大延时是 2,147,483,647 毫秒；本版本拒绝超限延时，避免 Node 溢出后立即执行。
- 上述无 fetch 断言验证被移除的功能没有发起 fetch；原生套接字、DNS、浏览器资源、子进程等由独立的网络守卫和网络边界测试验证。
