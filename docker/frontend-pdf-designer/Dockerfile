# Build stage
FROM node:20-alpine as build

ARG VERSION=0.0.0

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build with version info
ENV VITE_APP_VERSION=${VERSION}
RUN npm run build

# Create version.json for easy access
RUN echo "{\"version\":\"${VERSION}\",\"service\":\"frontend-pdf-designer\",\"buildTime\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > /app/dist/version.json

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config for SPA routing
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
