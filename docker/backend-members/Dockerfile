FROM node:20-alpine

ARG VERSION=0.0.0
ENV APP_VERSION=${VERSION}

WORKDIR /app

# Dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Source
COPY src/ ./src/

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "src/index.js"]
