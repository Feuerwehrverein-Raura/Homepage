FROM alpine:3.19

RUN apk add --no-cache avahi avahi-tools dbus

COPY avahi-daemon.conf /etc/avahi/avahi-daemon.conf
COPY services/ /etc/avahi/services/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
