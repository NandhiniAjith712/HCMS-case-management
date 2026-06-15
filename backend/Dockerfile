# ---- build stage (keeps final image small) ----
    FROM node:20-alpine AS build
    WORKDIR /app
    COPY package*.json ./
    RUN npm ci --only=production
    COPY . .

    # ---- runtime stage ----
    FROM node:20-alpine
    WORKDIR /app
    ENV NODE_ENV=production
    COPY --from=build /app /app
    # Expose the port your server listens on (adjust if different)
    EXPOSE 5100
    # Load env at runtime; we'll mount config.env or use ENV vars
    CMD ["node", "server.js"]
