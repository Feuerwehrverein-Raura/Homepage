#!/bin/sh
# Vereinsserver: /opt/acme-kasse-lokal/erneuern.sh (root, taeglich per Timer)
# Holt/erneuert das Zertifikat fuer kasse-lokal.fwv-raura.ch per DNS-Pruefung
# bei Hetzner (acme.sh, dns_hetznercloud) und schiebt es ueber WireGuard auf
# den T400. Das Hetzner-Token bleibt hier (hetzner.env, 0600) - nie auf dem
# T400, der offen im Schopf steht.
set -eu
D=/opt/acme-kasse-lokal
NAME=kasse-lokal.fwv-raura.ch
. "$D/hetzner.env"
export HETZNER_TOKEN
rc=0
docker run --rm -v "$D/acme:/acme.sh" -e HETZNER_TOKEN neilpang/acme.sh:latest \
  --issue --dns dns_hetznercloud -d "$NAME" --server letsencrypt --keylength ec-256 || rc=$?
# 0 = neu ausgestellt, 2 = noch nicht faellig; alles andere ist ein Fehler
[ "$rc" = 0 ] || [ "$rc" = 2 ] || { logger -t heinzel "kasse-lokal Zertifikat: acme.sh Fehler $rc"; exit "$rc"; }
C="$D/acme/${NAME}_ecc"
neu=$(sha256sum "$C/fullchain.cer" | cut -d' ' -f1)
alt=$(cat "$D/zuletzt-gesendet" 2>/dev/null || true)
[ "$neu" = "$alt" ] && [ "${1:-}" != "--senden" ] && exit 0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cp "$C/fullchain.cer" "$tmp/fullchain.pem"; cp "$C/$NAME.key" "$tmp/key.pem"
tar -cf - -C "$tmp" fullchain.pem key.pem | ssh -i "$D/t400-schluessel" -o BatchMode=yes -o ConnectTimeout=10 \
  -o UserKnownHostsFile="$D/known_hosts" -o StrictHostKeyChecking=yes stefan@192.168.88.10
echo "$neu" > "$D/zuletzt-gesendet"
logger -t heinzel "kasse-lokal Zertifikat an den T400 gesendet"
