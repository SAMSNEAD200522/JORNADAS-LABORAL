FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig*.json ./
COPY prisma/ ./prisma/
RUN npm ci && npx prisma generate
COPY . .
RUN npm run build

FROM node:22-alpine AS prod
WORKDIR /app
RUN apk add --no-cache tzdata
ENV TZ=America/Bogota
COPY package*.json ./
COPY prisma/ ./prisma/
RUN npm ci --only=production && npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
