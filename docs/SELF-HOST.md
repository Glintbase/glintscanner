# Self-hosting Glintscanner

## Minimal (CLI only)

```bash
npm install
npm run glintscan -- https://docs.yourproduct.com --markdown
```

No database required. Network egress to target docs is required.

## Web app

```bash
npm install
cp .env.local.example .env.local
# Set Supabase + Upstash for production
npm run build
npm start
```

### Recommended production env

```
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
# Optional
FIRECRAWL_API_KEY=...
```

Run [`migration.sql`](../migration.sql) in Supabase.

### Docker (outline)

```dockerfile
# Example — adjust for your registry
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t glintscanner .
docker run -p 3000:3000 --env-file .env.local glintscanner
```

## Security notes

- Always configure Redis rate limits in multi-instance deploys
- Never ship the service role key to the client
- See [SECURITY.md](../SECURITY.md)
