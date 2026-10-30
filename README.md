# LobeHub intranet fork

Based on upstream commit `049c81d53b0c2282eabf1edca2d90d58ad1f60f0` (v2.2.1).
This fork targets the self-hosted web application with private PostgreSQL/ParadeDB, Redis, MinIO and model services.

- [中文说明](README.zh-CN.md)
- [Offline deployment instructions](deploy/intranet/README.md)
- [Release scope and verification](INTRANET-RELEASE.md)
- [Deployment verification limits](deploy/intranet/DEPLOYMENT-VERIFICATION.md)

The server denies outbound traffic unless an exact private endpoint is allowed. Browser resources remain same-origin.
Klavis, QStash, Vercel integrations, cloud marketplaces, remote telemetry and internet-dependent workflows are removed or disabled.
Password authentication, private model chat, file storage and knowledge-base functionality are retained.
Scheduled tasks are disabled; PDF export requires an operator-provided local CJK font.

Production deployments require the network namespace and kernel firewall in `deploy/intranet/compose.yaml`, together with isolated client networking.
The Node guard alone is not a system-level security boundary. Upstream cloud deployment and Electron desktop distribution are outside this fork's supported scope.
Prepare images and models before importing them into the isolated network. Run the supplied acceptance procedure against the actual deployment before approving production use.

Upstream licensing remains in [LICENSE](LICENSE).
