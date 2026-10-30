#!/bin/sh
set -eu
test -f /run/policy-ready
for chain in INPUT OUTPUT FORWARD; do
    test "$(iptables -S "$chain" | head -n 1)" = "-P $chain DROP"
    test "$(ip6tables -S "$chain" | head -n 1)" = "-P $chain DROP"
    test "$(ip6tables -S "$chain" | wc -l | tr -d ' ')" = 1
done
# Exact counts plus every expected rule reject injected ACCEPT rules, even
# when they precede the terminal REJECT. No mutable policy file is consulted.
test "$(iptables -S INPUT | wc -l | tr -d ' ')" = 4
test "$(iptables -S OUTPUT | wc -l | tr -d ' ')" = 10
test "$(iptables -S FORWARD | wc -l | tr -d ' ')" = 1
iptables -C INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -C OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -C INPUT -i lo -p tcp -m multiport --dports 3210,8443 -j ACCEPT
iptables -C OUTPUT -o lo -d 127.0.0.1 -p tcp -m multiport --dports 3210,8443 -j ACCEPT
iptables -C INPUT -p tcp --dport 8443 -j ACCEPT
for endpoint in '172.30.90.10 5432' '172.30.90.11 6379' '172.30.90.12 9000' '172.30.90.13 11434'; do
    set -- $endpoint
    iptables -C OUTPUT -d "$1" -p tcp --dport "$2" -j ACCEPT
done
iptables -C OUTPUT -d 172.30.90.53 -p udp --dport 53 -j ACCEPT
iptables -C OUTPUT -d 172.30.90.53 -p tcp --dport 53 -j ACCEPT
test "$(iptables -S OUTPUT | tail -n 1)" = '-A OUTPUT -j REJECT --reject-with icmp-port-unreachable'
