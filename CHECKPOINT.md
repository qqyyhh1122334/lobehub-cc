# LobeHub 内网版：连续执行检查点

固定基线：049c81d53b0c2282eabf1edca2d90d58ad1f60f0。此包已包含所有修改，无需再次打补丁；未包含 node_modules、构建产物、镜像、模型、证书、密钥或 Git 对象。

2026-11-02 在可联网准备机上恢复了被 `.gitignore` 丢掉的 `pnpm-lock.yaml`（SHA256 `964fcace…b9ed5`）和 `public/intranet-browser-guard.js`，用 BuildKit 构建 `lobehub-intranet:049c81d`，并在本机 Compose 上跑通 `node deploy/intranet/accept.mjs`：`status: passed`。通过项包括不可变镜像、内核防火墙、零抓包、密码注册 / 登录、qwen3:8b 流式聊天、bge-m3 的 1024 维嵌入、105 项迁移哈希和同源 S3。Node 定向检查 161 通过 0 跳过，Python 配置检查 10 通过。中文 PDF 字体仍未附带。详见 deploy/intranet/DEPLOYMENT-VERIFICATION.md。

版本与结果入口：RELEASE.json、SOURCE-MANIFEST.sha256、verification/SUMMARY.json、INTRANET-RELEASE.md、deploy/intranet/DEPLOYMENT-VERIFICATION.md。

若从上游固定基线重建补丁内容，先应用 changes-from-049c81d.patch，再应用 changes-after-2c6b8e3.patch。若已有初始 2c6b8e3 交付源码，只应用第二个。第二个是累计补丁，不得叠加较早检查点的累计补丁。补丁只覆盖源码 / 部署文档，校验清单及证据由本完整包提供。新累计补丁已在初始源码文件副本上实际 git apply，并逐文件字节核对。

每 4 小时调度已按用户要求暂停。当前会话连续执行到网络授权 403 及真实部署环境缺失；没有声称仍存在后台常驻测试进程。
