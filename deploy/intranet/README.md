# LobeHub 049c81d 内网部署

基线：`049c81d53b0c2282eabf1edca2d90d58ad1f60f0`，LobeHub v2.2.1。

本目录提供本地模型、PostgreSQL、Redis、私有 S3、密码登录、TLS 入口和默认拒绝出站流量的部署配置。运行阶段不下载 npm 包、镜像、模型、字体或 CDN 资源。镜像、模型和证书需要在交付前准备好；离线运行不等于可以在没有依赖材料的机器上凭空编译源码。

模型下载入口已禁用；缺少模型时由管理员在准备环境导入审核过的模型文件。此版本不提供视频生成或原生视频处理：创建任务、配额查询、旧异步回调及后台轮询均在数据库写入和供应商初始化之前拒绝，不能通过恢复旧调用绕过界面限制。`ffmpeg-static` 已移除；内网 ComfyUI 视频处理需另行实现与验收后才能启用。

**验收状态请看 [DEPLOYMENT-VERIFICATION.md](./DEPLOYMENT-VERIFICATION.md)。当前开发环境没有 Docker CLI/daemon，不能把静态检查当作容器启动、真实数据库迁移或完整业务验收。必须在目标主机执行 `accept.mjs`，全部通过后再交付生产。**

2026-10-30 检查点新增迁移全清单/哈希、SSE 完成事件和命令超时检查，必须重建应用镜像以包含 `migration-check.cjs`、`probe-deadline.cjs`、`sse-check.cjs`，不能用旧镜像绕过失败。普通 Docker 命令最多等待 30 秒，Compose 启动 6 分钟，应用探针外层 12 分钟；探针内部另有 10 分钟硬截止，数据库连接/语句/客户端查询分别限 10/15/20 秒。硬截止可能来不及清理测试账号和对象，报告会明确说明清理未确认，验收判定失败。使用新的专用测试账号，保留失败报告供清理核对。

## 隔离结构

| 组件           | 网络与权限                                                  | 用途                                                                               |
| -------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| network-policy | 入口网 + `internal: true` 后端网；唯一有 `NET_ADMIN` 的服务 | 在应用启动前配置 IPv4/IPv6 默认 DROP、精确 IP/端口白名单；`NET_RAW` 仅用于验收抓包 |
| app、nginx     | 共用 network-policy 网络命名空间，非 root，`cap_drop: ALL`  | 所有应用与子进程都受同一内核规则约束；浏览器统一 TLS 同源访问                      |
| PostgreSQL     | `172.30.90.10:5432`，仅后端内网                             | ParadeDB，必须同时具备 `vector` 与 `pg_search`；基线迁移 0090 使用 `pg_search`     |
| Redis          | `172.30.90.11:6379`，仅后端内网                             | 缓存及会话；不发布主机端口                                                         |
| MinIO          | `172.30.90.12:9000`，仅后端内网                             | 私有 `lobehub-files` 桶；浏览器经 nginx 同源签名上传/下载                          |
| Ollama         | `172.30.90.13:11434`，仅后端内网                            | 默认聊天模型 `qwen3:8b`，1024 维嵌入模型 `bge-m3`                                  |
| CoreDNS        | `172.30.90.53:53`，仅后端内网                               | 只将本部署 `.internal` 主机名解析到回环；其他域名返回 NXDOMAIN，没有 DNS 转发器    |

应用额外预加载 `scripts/intranet/network-guard.cjs`，采用精确主机/端口白名单；该层用于提前拒绝及可诊断报错。最终网络边界是内核防火墙和 Docker 内网，覆盖不经 JavaScript fetch 的原生模块和子进程。不要给应用增加 `NET_ADMIN`、host 网络、Docker socket 或额外网络。

浏览器由强制 CSP 和前端防护约束。服务端 Docker 网络不能管理用户浏览器的其他标签页、扩展、用户另行导航或浏览器自身更新。需要对整台终端保证无公网访问时，终端所在网络也必须实施出口封禁。

## 1. 在准备环境构建并收集材料

要求 Linux Docker Engine、Docker Compose v2（支持 `--wait`）、Node.js 24；准备机与目标机的 CPU 架构应一致。默认模型建议预留至少 24 GB 内存及足够磁盘，实际需求由模型大小和上下文决定。检查 `172.30.90.0/24` 不与现有网络重叠；若修改该网段，必须同步所有端点、DNS、防火墙、校验器和测试，不能只改 Compose。

在仓库根目录运行：

```bash
node deploy/intranet/configure.mjs --host lobehub.internal --emails admin@corp.internal,acceptance@corp.internal
docker build -f Dockerfile.intranet -t lobehub-intranet:049c81d .
docker build -f deploy/intranet/Dockerfile.firewall -t lobehub-intranet-firewall:049c81d deploy/intranet
```

`configure.mjs` 生成权限为 `0600` 的 `.env`，不会覆盖现有文件。`KEY_VAULTS_SECRET` 是随机 32 字节的 Base64 编码，其他密码独立生成。该密钥用于解密已有数据，部署后必须备份，不能任意重置。

构建使用固定 pnpm 版本及提交后的 `pnpm-lock.yaml`；应用编译步骤使用 BuildKit `--network=none`。联网准备阶段若使用企业 TLS 检查代理，应保留代理设置，向两次 `docker build` 加入 `--secret id=proxy_ca,src=/path/to/combined-ca-bundle.pem`。不要关闭 TLS 校验。准备过程需要 npm 与镜像仓库访问；这些访问不发生在运行容器里。

所有常用源码构建命令（`pnpm build`、`build:intranet`、`build:docker`、`build:next`、`build:spa`、`build:spa:mobile`、`build:spa:copy`）统一进入 `scripts/intranet/build.cjs`。它串行构建桌面网页 SPA、移动网页 SPA、复制本地资源并构建 Next；每个 Node 子进程都预加载网络防护，构建端点白名单固定为空，遥测关闭。复制脚本由 Node 24 原生 TypeScript 支持运行，不依赖 Bun 或 tsx CLI 的额外 IPC 服务。这里的 desktop SPA 指桌面浏览器页面，不是 Electron 应用。

默认单个 Node 进程堆限制为 4400 MiB，Rust 与 libuv 线程数为 2，Next 构建 CPU 数为 2；这些设置不是整个进程树的 RSS 硬上限，原生编译器和工作进程还需要额外内存。资源受限环境不要同时运行其他构建或全量类型检查。可用 `LOBE_BUILD_HEAP_MB=4096 pnpm build` 调整堆；Docker 构建用 `--build-arg LOBE_BUILD_HEAP_MB=4096`。合法范围 1024–8192 MiB。

Next 构建默认使用 Webpack，并启用 `experimental.webpackMemoryOptimizations`，降低受限环境的内存压力。`pnpm build`、`pnpm build:next` 与 Docker 采用同一路径；额外传入 `--webpack` 会去重，`--debug` 可用于诊断。所有类型错误仍然会阻止构建。此前在本次环境尝试的 Turbopack 构建因内存接近 8 GiB 且长时间无进展而中止，不能计为构建通过；实际完整构建结果以交付验证记录为准。

直接在普通主机运行 `pnpm build` 的 Node 防护不能约束恶意原生程序的任意网络调用。需要证明编译阶段所有进程没有公网出口时，使用本 Dockerfile 的 `RUN --network=none`，或者由管理员提供等效隔离；不要将普通主机构建等同于内核隔离构建。独立 Docker 构建验证在本次开发环境尚未执行。

Docker 编译完成后，`prepare-runtime.cjs` 从已安装且锁定的依赖中递归打包迁移与 S3 启动入口的完整依赖图，为每个版本及 pnpm peer 上下文保留独立目录和相对链接，不再重新解析或下载包。检查会把 standalone 暂移至独立临时目录，通过 Node 24 解析钩子禁止 CommonJS 或 ESM 回退到构建目录；检查失败会还原原有产物。该步骤同样使用 `--network=none`。请勿在正在运行的 standalone 目录上手动执行此准备步骤。`public`（含 SPA、PDF 静态资源）与 `.next/static` 由 Docker 单独复制，`dist` 只在构建时使用。

### PDF 导出字体材料

**仓库目前没有附带中文 PDF 导出字体。** 要启用聊天 PDF 导出，管理员须在构建前提供具有合法使用授权、兼容 PDFKit 的 CJK TTF/OTF 字体，放入 `public/fonts/SourceHanSansSC-Regular.otf`（该路径的文件必须确实是兼容字体），随后重新构建镜像。也可将字体只读挂载到容器本地路径，并设置 `INTRANET_PDF_FONT_PATH` 为该绝对文件路径；不能设置成 HTTP URL。UID 1000 必须能读取它。

缺少字体时，PDF 导出会明确失败，Markdown/JSON 导出仍可用；程序不会回退下载外网字体。PDF.js 阅读所需 CMap、标准字体和 WASM 随已锁定的 `pdfjs-dist` 包复制到本地，与聊天 PDF 导出的中文字体是两件事。正式验收必须另测中文 PDF 导出及版面，当前 `accept.mjs` 不把未提供字体的 PDF 导出算作已通过。

### 收集基础服务镜像与模型

进入 `deploy/intranet`，明确拉取本地 Compose 所需基础服务镜像：

```bash
docker compose -f compose.yaml config --images
docker compose -f compose.yaml pull --policy always postgres redis storage model dns nginx
```

如果组织有审批过的镜像，在 `.env` 中设置 `POSTGRES_IMAGE`、`REDIS_IMAGE`、`STORAGE_IMAGE`、`MODEL_IMAGE`、`DNS_IMAGE`、`NGINX_IMAGE`。PostgreSQL 默认沿用上游 ParadeDB 的 pg17 标签，导出清单会记录实际不可变 image ID 与 digest；离线验收要求 ID 完全一致，不能只比较标签。建议生产审批时把上游标签换成已验证 digest。

模型需要单独预装。以下临时容器只属于联网准备阶段，不是内网运行配置：

```bash
docker run -d --name lobe-model-prep -v "$PWD/model-data:/root/.ollama" ollama/ollama:0.6.6 serve
docker exec lobe-model-prep ollama pull qwen3:8b
docker exec lobe-model-prep ollama pull bge-m3
docker stop lobe-model-prep
docker rm lobe-model-prep
```

只把专用模型目录用于此部署。启动前的无网络权限初始化容器会把该目录所有文件所有权规范到 UID/GID 1000；模型服务以该用户运行。不要把其他业务目录挂到这里。模型导入不允许符号链接。

准备由内网 CA 签发的证书，SAN 包含 `lobehub.internal`。放入：

```text
certs/cert.pem   服务证书及必要中间证书链
certs/key.pem    服务私钥
certs/ca.pem     内网 CA 信任链
```

Linux 主机上设置：

```bash
sudo chown root:101 certs/key.pem
sudo chmod 0640 certs/key.pem
chmod 0644 certs/cert.pem certs/ca.pem
```

nginx 以 UID/GID 101 读取私钥，app 以 UID 1000 读取 CA。证书逐个只读挂载，证书目录中其他材料不会进入容器。客户端也需信任内网 CA。不要将密钥、`.env` 或权重提交 Git。

导出已构建和已下载的镜像：

```bash
node export-offline.mjs ./bundle
tar -cf model-data.tar model-data
sha256sum model-data.tar > model-data.tar.sha256
```

交付本目录配置与脚本、`bundle/images.tar`、`bundle/manifest.json`、模型压缩包及哈希；`.env` 和证书通过受控的独立通道交付。镜像清单的 SHA256 用于完整性校验，不等同于来源签名；清单本身也必须通过可信渠道交付。

## 2. 在隔离主机启动

目标主机预先安装 Docker、Compose v2 和 Node.js 24。不要在内网运行阶段执行 `docker pull`、`npm install` 或 `ollama pull`。

```bash
cd deploy/intranet
sha256sum -c model-data.tar.sha256
tar -xf model-data.tar
node import-offline.mjs ./bundle
docker compose -f compose.yaml up -d --pull never --wait --wait-timeout 300
```

默认只绑定主机 `127.0.0.1:8443`。要向内网用户开放，在 `.env` 将 `BIND_IP` 改为本机指定的内网 IPv4 地址，同时将客户端 DNS 的 `lobehub.internal` 指向该地址。不要把它发布到公网。使用 `https://lobehub.internal:8443`；本配置固定端口 8443，改端口需同步签名、证书入口和网络策略。

应用本身固定监听共享网络命名空间内的 `127.0.0.1:3210`，由同命名空间的 nginx 代理。对内网开放时只调整前述 `BIND_IP`，不要把 app 的 `HOSTNAME` 改成 `0.0.0.0`。Node 监听过程也会调用地址解析，出站防护会拒绝未经允许的通配地址；本配置没有为解决监听而放宽 `0.0.0.0` 的网络权限。源码命令 `pnpm start` 与 `pnpm dev:next` 同样明确绑定回环地址，分别使用 3210/3010；运行前仍需在环境中提供对应回环端点及所需内部服务的精确白名单。

首次启动会校验配置、创建私有桶、执行原版数据库迁移，然后启动应用。新部署的存储目录权限会初始化，数据库与 Redis 数据存放在持久化卷中。

网页注册入口对外拒绝访问；邮箱白名单不能在没有邮箱验证时证明邮箱所有权，因此账户由内网管理员在部署主机创建：

```bash
export INTRANET_ACCOUNT_EMAIL=admin@corp.internal
read -r -s -p 'Initial password: ' INTRANET_ACCOUNT_PASSWORD
export INTRANET_ACCOUNT_PASSWORD
node provision-account.mjs
unset INTRANET_ACCOUNT_PASSWORD
```

密码至少 16 字符，邮箱必须在 `.env` 白名单内。该脚本经容器回环地址调用本地注册接口。用户随后在网页正常登录，不需要外网身份提供商或外网邮件服务。

## 3. 一条命令执行实际验收

先阻止其他客户端访问，保证抓包窗口没有并发用户流量。准备一个**尚不存在**且已列入邮箱白名单的测试账户；验收会临时创建它，完成后退出会话并按准确的用户 ID 和邮箱删除其数据库记录及测试 S3 对象。失败时应阅读报告，检查清理结果后再运行。

```bash
export INTRANET_TEST_EMAIL=acceptance@corp.internal
read -r -s -p 'Temporary test password: ' INTRANET_TEST_PASSWORD
export INTRANET_TEST_PASSWORD
node accept.mjs ./bundle/manifest.json
unset INTRANET_TEST_PASSWORD
```

没有 Docker、正确证书权限、预装模型、镜像清单或测试凭据时，验收失败退出，不会跳过相关测试。它依次检查：

- Compose 结构与本地 image ID；所有服务禁止自动拉取镜像。
- 容器健康、实际 app/nginx/firewall 网络命名空间一致、完整预期防火墙规则。
- **移除 Node preload 后**用原生 TCP/UDP/DNS 访问测试公网 IP、云元数据 IP，确认拒绝计数增加。
- 在真实注册、密码登录、会话验证、应用聊天 SSE、Ollama 推理、1024 维嵌入、数据库扩展/迁移、同源签名上传/下载期间保持抓包；发现非白名单出站包即失败。
- 网页 CSP、上传内容 sandbox CSP、强制下载响应头。

验收生成 `acceptance-*.json`。这仍不能替代目标环境的浏览器交互回归：还应实际完成中文登录、流式聊天、图片上传、PDF 上传与知识库检索、刷新重登、重启后持久化检查。修改模型、证书、端点、镜像、网络或权限后必须重新验收。

## 运维边界

- 不要单独重建 network-policy 容器后让 app/nginx 继续使用旧命名空间。升级或修改策略时整组 `docker compose down` 再 `up`，**不要加 `-v`**；持久卷保留。普通 `restart` 不会清空现有防火墙，但策略更新仍按整组重建处理。
- app 不允许代理环境变量；Compose 已显式置空 HTTP/HTTPS/ALL_PROXY 的大小写变体。使用内部转发代理也会扩大出口能力，不能直接加入白名单。
- 如需额外内网模型、SMTP、MCP 或 S3 服务，需同时修改配置、精确端点白名单、内核规则和验收。不要用“允许所有私网”代替精确服务名单。
- 原本依赖公网的 Klavis、云市场、联网搜索、云身份、遥测和相关功能已禁用/移除；详见 [SAAS-VERIFICATION.md](./SAAS-VERIFICATION.md)。本地内存任务队列不具备 QStash 的跨进程持久化和重启恢复保证；不能把已接受的后台任务视为持久任务。
- 本配置面向 Linux 容器服务端网页版本，不包含 Electron 桌面分发和公网机器人网关。后端网络限制无法约束部署管理员直接修改宿主机、Docker 权限或容器防火墙。
