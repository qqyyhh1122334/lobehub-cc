# 本地前后端连接内网 Docker 基础服务

默认联调方式：开发机运行 Next.js 和 Vite，内网服务器的 Docker 只运行 PostgreSQL、Redis、RustFS 和 SearXNG。前后端代码都在本地修改并热更新，开发机不需要 Docker，也不需要连接远程 Docker 管理接口。

```text
本地浏览器 http://localhost:3010
  ├─ 本地 Next.js :3010（页面、登录、API、SSE）
  └─ 本地 Vite :9876（前端模块与 HMR）

本地 Next.js → 内网 PostgreSQL / Redis / RustFS / SearXNG
本地浏览器 → 内网 RustFS（附件直传和预览）
```

## 1. 服务器启动基础服务

在内网服务器的仓库根目录执行：

```bash
cp docker-compose/dev/.env.zh-CN.example docker-compose/dev/.env
```

修改服务器侧 `docker-compose/dev/.env`，填写数据库和 RustFS 凭据。基础设施模式不需要应用的 `AUTH_SECRET` 或 `KEY_VAULTS_SECRET`，也不启用 `server` profile。

```dotenv
# 可填写服务器的私网或 VPN IP；通过 SSH 隧道访问时可设为 127.0.0.1。
DEV_BIND_HOST=10.0.0.8
POSTGRES_PORT=5432
REDIS_PORT=6379
RUSTFS_PORT=9000
SEARXNG_PORT=8180

LOBE_DB_NAME=lobechat
POSTGRES_PASSWORD=<数据库密码>
RUSTFS_ACCESS_KEY=<S3访问密钥>
RUSTFS_SECRET_KEY=<S3秘密密钥>
RUSTFS_LOBE_BUCKET=lobe
RUSTFS_CORS_ALLOWED_ORIGINS=http://localhost:3010
```

先启动常驻服务并等待就绪，再执行 bucket 初始化：

```bash
docker compose --env-file docker-compose/dev/.env -f docker-compose/dev/docker-compose.yml up -d --wait postgresql redis rustfs searxng
docker compose --env-file docker-compose/dev/.env -f docker-compose/dev/docker-compose.yml run --rm --no-deps rustfs-init
```

两阶段启动避免 `--wait` 等待已经成功退出的初始化容器。`rustfs-init` 创建配置的 bucket，并沿用开发环境的匿名读取策略；使用真实私有资料时按 [内网部署分析](../../INTRANET_DEPLOYMENT_ANALYSIS.md#4-rustfs-与附件链路) 调整访问控制。

本地连接只需要这些服务端口可达。数据库、Redis 和 Console 限制在开发私网、VPN 或 SSH 隧道内。需要修改端口时，服务器的 `POSTGRES_PORT` 等发布配置与开发机的 `DEV_POSTGRES_PORT` 等连接配置要保持一致。

## 2. 开发机配置远程依赖

在开发机仓库根目录执行：

```bash
cp .env.example.development.intranet .env.development.local
```

编辑 `.env.development.local`：

- `DEV_INFRA_HOST`：填写内网服务器实际 IPv4，不带协议或端口；模板自动派生四类服务地址。
- `POSTGRES_PASSWORD`、`LOBE_DB_NAME`：与服务器数据库配置一致。密码含 URL 特殊字符时，单独改写百分号编码后的 `DATABASE_URL`。
- `RUSTFS_ACCESS_KEY`、`RUSTFS_SECRET_KEY`、`RUSTFS_LOBE_BUCKET`：与服务器配置一致。
- `AUTH_SECRET`：运行 `openssl rand -base64 32` 生成并保存。
- `KEY_VAULTS_SECRET`：新开发数据库单独生成；已有数据库必须使用该库原有的加密密钥，不能重新生成。
- 模型服务地址和密钥：配置在开发机，由本地 Next.js 发起模型请求。

模板中的 `APP_URL` 和 `INTERNAL_APP_URL` 指向本地 Next.js。`DEV_BACKEND_URL` 留空即可，完整开发启动器会将子进程中的该值设置为本次本地 Next 地址，不会沿用之前的远程后端或线上调试地址。

`S3_ENDPOINT` 必须同时被本地 Next.js 和浏览器访问，不能填写 Docker 容器名。RustFS 需允许实际页面 Origin，默认是 `http://localhost:3010`；换成 `127.0.0.1` 或其他端口时，同步修改 CORS 白名单。

环境文件保存在本地，不提交密钥。模板使用 dotenv 变量引用，不要直接通过 shell `source` 加载。

## 3. 开发机启动前后端

```bash
pnpm install
# 首次使用或更新数据库结构时，在确认是开发数据库后执行。
bun run db:migrate
bun run dev
```

浏览器打开 **`http://localhost:3010`**。Next.js 和 Vite 都在本地运行，本命令不会启动或连接 Docker。前端组件修改由 Vite 热更新，后端路由修改由 Next 开发服务器处理，无需向服务器同步应用源码。

自定义 Next 端口可使用 `bun run dev --port 4010`。启动器将该端口传给两个子进程，模板中的 `${PORT}` 引用也会同步展开；如果应用 URL 被写成固定值，要同步修改。RustFS 的 CORS 也需允许新的页面 Origin。

## 4. 内网端口不可直连时使用 SSH 隧道

如果开发机能 SSH 到服务器，但不能直接访问服务端口，可在开发机另开终端并保持连接：

```bash
ssh -N -o ExitOnForwardFailure=yes \
  -L 15432:127.0.0.1:5432 \
  -L 16379:127.0.0.1:6379 \
  -L 19000:127.0.0.1:9000 \
  -L 18180:127.0.0.1:8180 \
  用户名@服务器地址
```

这组命令对应服务器 `DEV_BIND_HOST=127.0.0.1` 的配置。随后修改本地 `.env.development.local`：

```dotenv
DEV_INFRA_HOST=127.0.0.1
DEV_POSTGRES_PORT=15432
DEV_REDIS_PORT=16379
DEV_RUSTFS_PORT=19000
DEV_SEARXNG_PORT=18180
```

四类服务均通过隧道访问，浏览器也能使用 `http://127.0.0.1:19000` 进行 S3 直传。此方式不需要远程 Docker context，也不需要开放 Docker API 端口。

## 5. 默认方式验收

1. 服务器上的数据库、Redis、RustFS 和搜索服务就绪，bucket 初始化成功。
2. 开发机执行迁移后，`bun run dev` 启动两个本地进程；日志中的 Next 和 Debug Proxy 均指向本次本地后端。
3. 访问本地 3010，登录、tRPC 和 SSE 请求保持本地同源，数据库等依赖连接远端地址。
4. 修改前端和后端分别确认生效；检查图片上传的 OPTIONS/PUT、预览与知识库检索。
5. 使用隧道时，断开与恢复 SSH 后按预期重新连接依赖。

## 6. 可选方式 仅本地前端连接远程后端

如果希望将 Next.js 也运行在服务器，可以继续使用以下附加方案。它与前面的本地双进程模式分别配置。

开发机只运行 `bun run dev:spa`，内网服务器使用本目录的 Compose，在 Node 22 容器中安装依赖、执行数据库迁移并启动 Next.js 后端。浏览器打开后端的 Debug Proxy 页面，从开发机 localhost 加载前端模块和 HMR；API、登录、Cookie 和附件请求保持后端同源。

```text
开发者浏览器
  ├─ HTTPS chat-dev.example.com → 网关 → 内网 Node 22 / Next.js :3210
  └─ HTTP localhost:9876 → 开发机 Vite（源码、模块与热更新）

内网 Next.js → PostgreSQL / Redis / RustFS / SearXNG / 模型服务
```

读取 localhost 的是开发者自己的浏览器，内网服务器不需要反向连接开发机。开发者的浏览器需要能访问后端域名及文件域名；网关至内网服务器的网络链路需要已打通。

### 6.1 在内网服务器启动后端

使用服务器上的独立仓库 checkout，与开发机使用兼容的代码版本。在服务器仓库根目录执行：

```bash
cp docker-compose/dev/.env.zh-CN.example docker-compose/dev/.env
openssl rand -base64 32
openssl rand -base64 32
```

将两次生成的值分别填入 `AUTH_SECRET` 和 `KEY_VAULTS_SECRET`，并修改服务器侧 `docker-compose/dev/.env`：

```dotenv
NODE_IMAGE=node:22-bookworm-slim
APP_URL=https://chat-dev.example.com
LOBE_PORT=3210

AUTH_SECRET=<独立生成并保存的认证密钥>
KEY_VAULTS_SECRET=<独立生成并保存的加密密钥>

LOBE_DB_NAME=lobechat
POSTGRES_PASSWORD=<数据库密码>

RUSTFS_PORT=9000
DEV_BIND_HOST=0.0.0.0
RUSTFS_ACCESS_KEY=<S3访问密钥>
RUSTFS_SECRET_KEY=<S3秘密密钥>
RUSTFS_LOBE_BUCKET=lobe
S3_ENDPOINT=https://files-dev.example.com
RUSTFS_CORS_ALLOWED_ORIGINS=https://chat-dev.example.com

# 根据实际模型服务设置，示例为 OpenAI 兼容的内网服务。
# OPENAI_PROXY_URL=http://model-service.internal:8000/v1
# OPENAI_API_KEY=<模型认证密钥>
```

`APP_URL` 填浏览器使用的后端地址，包括网关终止的 HTTPS。`S3_ENDPOINT` 必须同时被浏览器和后端容器访问，不能填容器内部名称或服务器自己的 localhost。通过网关访问 RustFS 时，还需配置文件域名、CORS 和签名透传，见根目录的 [内网部署分析](../../INTRANET_DEPLOYMENT_ANALYSIS.md#4-rustfs-与附件链路)。

启动：

```bash
docker compose --env-file docker-compose/dev/.env -f docker-compose/dev/docker-compose.yml --profile server up -d --wait
```

查看启动进度：

```bash
docker compose --env-file docker-compose/dev/.env -f docker-compose/dev/docker-compose.yml --profile server logs -f lobe
```

`server` profile 新增的 `lobe` 服务使用 Node 22，挂载仓库源码，依次执行：

1. 校验应用地址及必要密钥。
2. 使用 Corepack 和仓库声明的 pnpm 版本安装依赖。
3. 执行 `pnpm run db:migrate`。
4. 执行 `next dev --hostname 0.0.0.0 --port 3210`。

首次安装需要服务器访问 Node 镜像仓库和包仓库，耗时取决于网络。依赖、pnpm store 和 `.next` 使用独立 Docker 卷复用，应用端口沿用 `network-service` 发布的 `LOBE_PORT`。容器不启动 Vite，也不需要安装 Bun。原有 `bun run dev:docker` 仍然只启动基础设施。

服务器不要复制开发机的 `node_modules`，也不要将开发机的数据库、S3 等 `.env.development.local` 配置一并复制过去。特别是数据库迁移脚本会读取根目录 dotenv 文件，已有同名变量可能覆盖 Compose 设置；服务器上的配置必须保持一致。数据库与文件数据、认证和加密密钥应持久保存。

### 6.2 在开发机启动前端

在开发机仓库的 `.env.development.local` 增加一项：

```dotenv
DEV_BACKEND_URL=https://chat-dev.example.com
```

然后运行：

```bash
pnpm install
bun run dev:spa
```

打开终端打印的 **Debug Proxy** 地址，例如：

```text
https://chat-dev.example.com/_dangerous_local_dev_proxy?debug-host=http%3A%2F%2Flocalhost%3A9876
```

这个地址的页面属于后端域名，前端模块来自本地 Vite。登录后仍可返回此调试页面，API 使用后端域名；不需要为这一模式重写 Cookie、将后端 `APP_URL` 改为 localhost，或增加 localhost 可信 Origin。

`DEV_BACKEND_URL` 只接受 HTTP(S) 的根 Origin，可以含端口，不接受子路径、账号密码、query 或 hash。未设置时保留原来的 `https://app.lobehub.com` 调试入口。该变量用于选择 Debug Proxy 后端；直接访问 Vite 的 localhost 页面仍沿用原有本地后端代理，并不是本模式的登录入口。

支持流程以 HTTPS 后端为主。浏览器若阻止后端页面访问 localhost，按浏览器提示授权本地网络访问，或为本地 Vite 配置受信任的 HTTPS；不要把 `debug-host` 换成任意公网主机。本入口只接受 loopback 主机。

### 6.3 网关与后端要求

- 网关原样透传 `/_dangerous_local_dev_proxy` 及其子路径、`/spa/*`、登录页面、API 和附件路由。
- Next 自托管已增加 Debug Proxy 到静态引导页的 rewrite，支持调试页面的深层链接刷新。
- Debug Proxy 请求 `/spa/{locale}/chat` 时使用 `Accept: application/json`，Next 直接返回公开 SPA 配置，跳过需要同机 Vite 的 HTML 模板步骤。因此后端容器无需连接开发机的 9876 端口。
- Node 22 的 `next dev` 是后端联调模式。需要完整后端托管的生产前端时，仍使用完整构建和生产部署流程；本模式的前端入口是 Debug Proxy。
- API 和聊天 SSE 的网关配置沿用 [内网部署分析](../../INTRANET_DEPLOYMENT_ANALYSIS.md#5-公网地址网关与鉴权) 的要求。RustFS Console、数据库和 Redis 端口限制在开发或管理网络。
- 本目录保留开发用匿名文件读取策略。使用真实私有资料前，需要按部署分析中的附件授权方案调整。

### 6.4 验证与排查

1. 在服务器检查容器日志，确认依赖安装、数据库迁移和 Next 启动均成功；`/api/version` 应返回成功响应。
2. 在开发机验证公开配置不需要同机 Vite：

   ```bash
   curl -H 'Accept: application/json' https://chat-dev.example.com/spa/en-US/chat
   ```

   应返回包含 `config`、`featureFlags`、`clientEnv` 等字段的 JSON，不能是网关登录页或错误 HTML。

3. 打开 Debug Proxy，确认登录后 tRPC、聊天 SSE 使用后端域名，模块和 HMR 使用 localhost 的实际端口。
4. 修改一个本地前端组件，验证热更新；刷新调试页面的深层 URL，确认仍能加载。
5. 上传附件并预览；如果上传失败，分别检查浏览器至文件域名的 CORS/签名和容器至同一 endpoint 的网络访问。

若终端仍打印线上后端地址，检查是否在开发机设置了 `DEV_BACKEND_URL` 并重启 `dev:spa`。若 Debug Proxy 404，确认服务器运行的是包含本次 rewrite 的源码。若页面提示本地脚本加载失败，检查本地 Vite 是否运行以及浏览器对 localhost 的访问限制。
