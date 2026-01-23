FROM node:20-alpine

# Install build dependencies for USB support (escpos-usb)
RUN apk add --no-cache python3 make g++ linux-headers libusb-dev eudev-dev

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
