# Baut die bestehende Website aus dem Hauptverzeichnis
FROM nginx:alpine

# Kopiere die bestehende Website
COPY ../../*.html /usr/share/nginx/html/
COPY ../../*.css /usr/share/nginx/html/
COPY ../../*.js /usr/share/nginx/html/
COPY ../../images/ /usr/share/nginx/html/images/
COPY ../../fonts/ /usr/share/nginx/html/fonts/

# Nginx Config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
