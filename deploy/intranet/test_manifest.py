"""Static topology regression checks. Requires PyYAML; not a Docker boot test."""
from pathlib import Path
import unittest
import yaml

ROOT = Path(__file__).resolve().parent


class DeploymentManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = yaml.safe_load((ROOT / "compose.yaml").read_text())
        cls.services = cls.manifest["services"]

    def test_no_runtime_pulls_or_builds(self):
        for service in self.services.values():
            self.assertEqual(service["pull_policy"], "never")
            self.assertNotIn("build", service)

    def test_backends_only_use_internal_network(self):
        self.assertTrue(self.manifest["networks"]["backend"]["internal"])
        for name in ["postgres", "redis", "storage", "model", "dns"]:
            self.assertEqual(set(self.services[name]["networks"]), {"backend"})
            self.assertNotIn("ports", self.services[name])

    def test_shared_namespace_has_no_forbidden_docker_flags(self):
        self.assertEqual(self.services["app"]["environment"]["HOSTNAME"], "127.0.0.1")
        self.assertEqual(self.services["app"]["environment"]["PORT"], "3210")
        for name in ["app", "nginx"]:
            service = self.services[name]
            self.assertEqual(service["network_mode"], "service:network-policy")
            for key in ["dns", "hostname", "extra_hosts", "networks", "ports"]:
                self.assertNotIn(key, service)
            self.assertEqual(service["depends_on"]["network-policy"]["condition"], "service_healthy")

    def test_only_policy_can_change_network(self):
        for name, service in self.services.items():
            self.assertFalse(service.get("privileged", False))
            self.assertNotIn("/var/run/docker.sock", str(service.get("volumes", [])))
            if name != "network-policy":
                self.assertNotIn("NET_ADMIN", service.get("cap_add", []))
                self.assertNotIn("NET_RAW", service.get("cap_add", []))
        self.assertTrue(self.services["app"]["read_only"])
        self.assertEqual(self.services["app"]["cap_drop"], ["ALL"])

    def test_proxies_are_explicitly_empty(self):
        for name, service in self.services.items():
            if name == "storage-permissions":
                continue
            for key in ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]:
                self.assertEqual(service["environment"][key], "")

    def test_dns_is_nonforwarding(self):
        dns = (ROOT / "Corefile").read_text()
        active = "\n".join(line for line in dns.splitlines() if not line.lstrip().startswith("#"))
        self.assertNotRegex(active, r"\b(forward|proxy|fallthrough)\b")
        self.assertIn("rcode NXDOMAIN", dns)
        self.assertIn("nameserver 172.30.90.53", (ROOT / "resolv.conf").read_text())
        self.assertIn("./resolv.conf:/etc/resolv.conf:ro", self.services["app"]["volumes"])

    def test_same_origin_signed_storage_and_sandbox(self):
        env = self.services["app"]["environment"]
        self.assertEqual(env["S3_ENDPOINT"], env["APP_URL"])
        self.assertEqual(env["S3_BUCKET"], "lobehub-files")
        nginx = (ROOT / "nginx.conf").read_text()
        s3 = nginx.split("location ^~ /lobehub-files/ {")[1].split("location / {")[0]
        self.assertIn("proxy_pass http://172.30.90.12:9000;", s3)
        self.assertNotIn("rewrite", s3)
        self.assertIn("sandbox", s3)
        self.assertIn("script-src 'none'", s3)
        self.assertIn("Content-Disposition attachment always", s3)

    def test_default_deny_and_exact_ports(self):
        rules = (ROOT / "firewall.sh").read_text()
        self.assertIn("iptables -P OUTPUT DROP", rules)
        self.assertIn("ip6tables -P OUTPUT DROP", rules)
        self.assertIn("iptables -A OUTPUT -j REJECT", rules)
        self.assertNotIn("-d 0.0.0.0/0 -j ACCEPT", rules)
        for endpoint in ["172.30.90.10 5432", "172.30.90.11 6379", "172.30.90.12 9000", "172.30.90.13 11434"]:
            self.assertIn(endpoint, rules)

    def test_storage_volume_permissions_are_initialized(self):
        for name in ["redis", "storage"]:
            self.assertEqual(self.services[name]["depends_on"]["storage-permissions"]["condition"], "service_completed_successfully")
        init = self.services["storage-permissions"]
        self.assertEqual(init["network_mode"], "none")
        self.assertEqual(init["entrypoint"], ["node", "/permissions.cjs"])
        self.assertIn("chownSync('/redis-data', 999, 999)", (ROOT / "permissions.cjs").read_text())
        self.assertEqual(self.services["model"]["user"], "1000:1000")

    def test_no_build_secrets_in_context(self):
        for name in [".dockerignore", "Dockerfile.intranet.dockerignore"]:
            text = (ROOT / "../.." / name).read_text()
            for pattern in [".env", ".env.*", "deploy/intranet/certs", "deploy/intranet/model-data", "deploy/intranet/bundle"]:
                self.assertIn(pattern, text.splitlines())


if __name__ == "__main__":
    unittest.main()
