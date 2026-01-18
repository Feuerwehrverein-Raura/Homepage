FROM node:20-alpine
ARG VERSION=0.0.0
ENV APP_VERSION=${VERSION}
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src/ ./src/
HEALTHCHECK --interval=30s --timeout=3s \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1
EXPOSE 3000
CMD ["node", "src/index.js"]
