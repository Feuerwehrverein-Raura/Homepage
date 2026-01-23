FROM node:20-alpine AS builder

# Install build dependencies for USB support (escpos-usb)
RUN apk add --no-cache python3 make g++ linux-headers libusb-dev eudev-dev

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

RUN apk add --no-cache libusb eudev-libs

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "start"]
