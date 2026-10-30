# LobeHub 内网版：连续执行检查点

固定基线：049c81d53b0c2282eabf1edca2d90d58ad1f60f0。此包已包含所有修改，无需再次打补丁；未包含 node_modules、构建产物、镜像、模型、证书、密钥或 Git 对象。

本轮修复 HTTP/2 CONNECT、验收无时限、截断 SSE 误通过三项问题；148 项 Node 检查通过，2 项因依赖缺失跳过，10 项 Python 配置检查通过。生产验收仍阻塞；当前构建未开始编译，历史构建证据不能代替新版验证。

版本与结果入口：RELEASE.json、SOURCE-MANIFEST.sha256、verification/SUMMARY.json、INTRANET-RELEASE.md、deploy/intranet/DEPLOYMENT-VERIFICATION.md。

若从上游固定基线重建补丁内容，先应用 changes-from-049c81d.patch，再应用 changes-after-2c6b8e3.patch。若已有初始 2c6b8e3 交付源码，只应用第二个。第二个是累计补丁，不得叠加较早检查点的累计补丁。补丁只覆盖源码/部署文档，校验清单及证据由本完整包提供。新累计补丁已在初始源码文件副本上实际 git apply，并逐文件字节核对。

每4小时调度已按用户要求暂停。当前会话连续执行到网络授权403及真实部署环境缺失；没有声称仍存在后台常驻测试进程。
