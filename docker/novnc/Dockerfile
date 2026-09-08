# noVNC — Bildschirm des Roten Schopfs im Browser ansehen.
#
# Der Container uebersetzt zwischen VNC (was x11vnc auf dem T400 spricht)
# und WebSockets (was ein Browser spricht). Er ist bewusst ein reiner
# Vermittler: Der Laptop bekommt keinen Port ins Internet, sondern wird
# ueber den WireGuard-Tunnel angesprochen.
#
# Bewusst schlank: Debian bringt novnc und websockify als Pakete mit,
# ein eigener Bau der Weboberflaeche ist unnoetig.
FROM debian:stable-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends novnc websockify ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Ziel des Vermittlers. Wird im Compose gesetzt, damit ein zweiter
# Bildschirm spaeter nur einen weiteren Container braucht.
ENV VNC_ZIEL=192.168.88.10:5900
ENV PORT=6080

EXPOSE 6080

# --heartbeat haelt die WebSocket-Verbindung durch Traefik hindurch offen;
# ohne das trennt der Proxy eine ruhige Verbindung nach einigen Minuten.
CMD ["sh", "-c", "websockify --web=/usr/share/novnc --heartbeat=30 ${PORT} ${VNC_ZIEL}"]
