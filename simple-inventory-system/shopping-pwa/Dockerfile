FROM node:20-alpine AS builder

ARG VITE_API_URL=https://inventar.fwv-raura.ch/api
ARG VITE_WS_URL=wss://inventar.fwv-raura.ch/ws
ARG VITE_AUTHENTIK_URL=https://auth.fwv-raura.ch
ARG VITE_AUTHENTIK_CLIENT_ID=inventory-system

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_AUTHENTIK_URL=$VITE_AUTHENTIK_URL
ENV VITE_AUTHENTIK_CLIENT_ID=$VITE_AUTHENTIK_CLIENT_ID

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
