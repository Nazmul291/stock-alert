FROM node:22-alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Install ALL deps — tsx is required at runtime for the worker process.
# If image size matters later, compile the worker to JS and restore --omit=dev.
COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

COPY . .

# Generate Prisma client and build the Remix app at image-build time
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

# Default CMD — Fly overrides this per process-type via fly.toml [processes]:
#   web    → "npm run start"
#   worker → "npm run start:worker"
# Migrations run separately via fly.toml [deploy] release_command.
CMD ["npm", "run", "start"]
