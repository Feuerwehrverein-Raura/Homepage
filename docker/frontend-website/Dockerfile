# Baut die bestehende Website aus dem Hauptverzeichnis
FROM nginx:alpine

# Kopiere die bestehende Website (Build-Context ist das Root-Verzeichnis)
COPY *.html /usr/share/nginx/html/
COPY *.css /usr/share/nginx/html/
COPY *.js /usr/share/nginx/html/
COPY images/ /usr/share/nginx/html/images/
COPY fonts/ /usr/share/nginx/html/fonts/
COPY scripts/config.js /usr/share/nginx/html/scripts/config.js

# Nginx Config
COPY docker/frontend-website/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
