#!/bin/sh
set -e

echo "=== FWV Raura mDNS (Avahi) ==="

# Detect Pi's IP address
PI_IP=$(hostname -I | awk '{print $1}')
echo "Detected IP: $PI_IP"
echo "Publishing: kasse.local, kitchen.local, inventar.local -> $PI_IP"

# Start dbus (required by avahi)
mkdir -p /run/dbus
dbus-daemon --system --nofork &
sleep 1

# Start avahi-daemon in background (publishes kasse.local automatically)
avahi-daemon --no-drop-root --no-chroot --daemonize
sleep 1

# Publish additional hostnames via mDNS
avahi-publish-address -R kitchen.local "$PI_IP" &
avahi-publish-address -R inventar.local "$PI_IP" &

echo "mDNS running. Hostnames:"
echo "  kasse.local     -> $PI_IP"
echo "  kitchen.local   -> $PI_IP"
echo "  inventar.local  -> $PI_IP"

# Keep container alive, forward signals to avahi
trap 'kill $(jobs -p) 2>/dev/null; exit 0' TERM INT
wait
