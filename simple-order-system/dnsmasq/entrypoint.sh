#!/bin/sh
set -e

if [ -z "$PI_IP" ]; then
    echo "ERROR: PI_IP ist nicht gesetzt!"
    echo "Setze PI_IP in .env, z.B.: PI_IP=192.168.1.10"
    exit 1
fi

echo "=== FWV Raura DNS / Captive Portal ==="
echo "PI_IP: $PI_IP"

# Template kopieren und PI_IP ersetzen
cp /etc/dnsmasq.conf.template /etc/dnsmasq.conf
sed -i "s/__PI_IP__/$PI_IP/g" /etc/dnsmasq.conf

echo "DNS-Umleitungen aktiv:"
echo "  .local Domains     -> $PI_IP"
echo "  Android Checks     -> $PI_IP"
echo "  iOS/Apple Checks   -> $PI_IP"
echo "  Samsung Checks     -> $PI_IP"
echo "  Microsoft Checks   -> $PI_IP"

exec dnsmasq --no-daemon --log-facility=-
