FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY scripts/prepare-ocr.mjs scripts/prepare-ocr.mjs
COPY vendor/paddle/LICENSE vendor/paddle/LICENSE
RUN node scripts/prepare-ocr.mjs
COPY . .
RUN npm run build
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
