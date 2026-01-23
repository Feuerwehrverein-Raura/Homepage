FROM node:20-alpine AS builder

ARG VITE_API_URL=http://localhost:3000/api
ARG VITE_SYNC_URL=

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SYNC_URL=$VITE_SYNC_URL

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
