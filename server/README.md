# NYX registrations service

Express + MongoDB service that owns teaser signups and serves the dashboard at **`/dashboard`**.

## Run it

```bash
cd server
cp .env.example .env      # fill in MONGODB_URI + DASHBOARD_PASSWORD
npm install
npm start                 # or: npm run dev  (node --watch)
```

Then open <http://localhost:4000/dashboard> — or <http://localhost:3000/dashboard> when the
Next teaser is running, since `next.config.ts` rewrites `/dashboard` and `/api/admin/*` to this service.

## Environment

| Variable | Meaning |
| --- | --- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/xnyx` locally, or the Atlas `mongodb+srv://…` string |
| `PORT` | defaults to `4000` |
| `DASHBOARD_PASSWORD` | password for the `/dashboard` login |
| `SESSION_SECRET` | signs the dashboard session cookie |
| `TZ_NAME` | timezone for "today" and the daily chart (default `Asia/Kolkata`) |

The Next app reads `API_ORIGIN` (default `http://localhost:4000`) to reach this service.

## Routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/register` | public | teaser signup — upserts by email, so repeats are silent no-ops |
| `GET /dashboard` | password | the dashboard |
| `GET /dashboard/login`, `POST /dashboard/login`, `POST /dashboard/logout` | — | session (HMAC-signed httpOnly cookie, 7 days, 5-attempt throttle) |
| `GET /api/admin/stats` | cookie | totals, today, last 7 days, latest, 30-day daily series |
| `GET /api/admin/registrations` | cookie | `?q=&page=&limit=&sort=name\|email\|createdAt&dir=asc\|desc` |
| `GET /api/admin/registrations.csv` | cookie | CSV export, honours `?q=` |
| `DELETE /api/admin/registrations/:id` | cookie | remove one signup (the ✕ in the table, with a confirm) |
| `GET /health` | public | liveness |

## Dev helpers

```bash
npm run seed              # 24 fake signups spread over 3 weeks
npm run seed -- 100       # more of them
npm run seed -- --clear   # remove every @seed.local row
node scripts/screenshot-dashboard.mjs <outDir>   # login + dashboard screenshots
```

## Deploying to Vercel

This runs on Vercel as its own project, alongside the teaser, from the same repo.
`api/index.js` exports the Express app instead of listening, and [vercel.json](vercel.json)
routes every path to it, so Express still owns routing. `npm start` locally is unchanged.

1. **New Vercel project** → import `balajied29/x-nyx` → set **Root Directory** to `server`.
   Framework preset: Other. No build command needed.
2. Add the environment variables from the table above (Production + Preview).
   `NODE_ENV=production` is set by Vercel, which is what flips the session cookie to `secure`.
3. Deploy, then copy the resulting URL.
4. On the **teaser's** Vercel project, set `API_ORIGIN` to that URL (no trailing slash) and
   redeploy. `/dashboard` and `/api/admin/*` are rewritten there, so the dashboard is reachable
   at `https://<teaser-domain>/dashboard`.
5. In Atlas, allow `0.0.0.0/0` under Network Access — Vercel functions have no fixed egress IP.

Notes for the serverless setup:

- Mongo connections are cached on `globalThis` (`connectCached` in [src/db.js](src/db.js)) so warm
  invocations reuse one pool; `maxPoolSize` is 5 to stay inside Atlas' free-tier limit.
- `public/**` is bundled into the function via `includeFiles` — the dashboard HTML/CSS/JS are read
  from disk at request time, so they must ship with it.
- The login throttle is in-memory, so it resets per container. It slows a casual guesser, not a
  determined one — use a long password.

## Also worth doing before launch

- Registrations are unauthenticated by design — add a rate limit or captcha if the teaser gets scraped.
- `data/registrations.json` from the pre-Mongo build is no longer read or written.
