FROM nginx:alpine

ARG VERSION=0.0.0

# Kopiere die Website-Dateien
COPY . /usr/share/nginx/html/

# Nginx Config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create version.json for easy access
RUN echo "{\"version\":\"${VERSION}\",\"service\":\"frontend-website\",\"buildTime\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > /usr/share/nginx/html/version.json

# Fix file permissions - nginx worker runs as non-root user
RUN chmod -R 644 /usr/share/nginx/html/*.html /usr/share/nginx/html/*.css /usr/share/nginx/html/*.js 2>/dev/null || true && \
    chmod -R 644 /usr/share/nginx/html/*.json 2>/dev/null || true && \
    chmod -R 644 /usr/share/nginx/html/downloads/*.pdf 2>/dev/null || true && \
    find /usr/share/nginx/html -type d -exec chmod 755 {} \;

EXPOSE 80
