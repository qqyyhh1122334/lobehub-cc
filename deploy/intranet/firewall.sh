#!/bin/sh
set -eu
# Executed once before the application is permitted to start. Docker's NAT
# table is untouched; deny rules are installed before allowing any traffic.
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP
iptables -F INPUT
iptables -F FORWARD
iptables -F OUTPUT
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -i lo -p tcp -m multiport --dports 3210,8443 -j ACCEPT
iptables -A OUTPUT -o lo -d 127.0.0.1 -p tcp -m multiport --dports 3210,8443 -j ACCEPT
iptables -A INPUT -p tcp --dport 8443 -j ACCEPT
for endpoint in '172.30.90.10 5432' '172.30.90.11 6379' '172.30.90.12 9000' '172.30.90.13 11434'; do
    set -- $endpoint
    iptables -A OUTPUT -d "$1" -p tcp --dport "$2" -j ACCEPT
done
# Direct DNS goes only to our non-forwarding authority. Docker's 127.0.0.11
# resolver, host gateway DNS and public DoH/DoT are deliberately not allowed.
iptables -A OUTPUT -d 172.30.90.53 -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -d 172.30.90.53 -p tcp --dport 53 -j ACCEPT
iptables -A OUTPUT -j REJECT --reject-with icmp-port-unreachable
ip6tables -P INPUT DROP
ip6tables -P FORWARD DROP
ip6tables -P OUTPUT DROP
ip6tables -F INPUT
ip6tables -F FORWARD
ip6tables -F OUTPUT
touch /run/policy-ready
exec tail -f /dev/null
