# LobeHub 内网部署分支

基于上游 `049c81d53b0c2282eabf1edca2d90d58ad1f60f0`（v2.2.1）修改。
本分支面向浏览器访问的自托管 Web 服务，使用内网 PostgreSQL/ParadeDB、Redis、MinIO 和模型服务。

- [部署说明与离线准备](deploy/intranet/README.md)
- [交付范围与验证记录](INTRANET-RELEASE.md)
- [部署测试的实际执行范围](deploy/intranet/DEPLOYMENT-VERIFICATION.md)
- [云服务功能移除与测试记录](deploy/intranet/SAAS-VERIFICATION.md)

服务器使用默认拒绝的网络策略，只放行明确配置的私有地址及端口；浏览器资源使用同源策略。
Klavis、QStash、Vercel 集成、云端市场、远程遥测及必须依赖公网的工作流已移除或关闭。
密码认证、内网模型聊天、文件和知识库能力保留。定时任务不提供持久调度；PDF 导出需管理员提供本地中文字体。

**生产部署必须使用 `deploy/intranet/compose.yaml` 的网络命名空间和内核防火墙，并在内网客户端访问。**
单独的 Node 网络拦截脚本不是系统级防火墙，不能把任意原生扩展、子进程或客户端浏览器的全部流量纳入应用层控制。
本分支不支持上游云托管和 Electron 桌面应用的发布流程。

先在准备机生成完整镜像和模型包，再导入隔离环境；内网运行期间不得安装依赖或下载模型。
请按部署说明运行验收脚本。未执行真实容器、数据库和模型联调时，不应将本分支视为已经完成生产验收。

本项目保留上游许可证，见 [LICENSE](LICENSE)。
