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

## Before this goes live

- Put it behind HTTPS (`NODE_ENV=production` makes the session cookie `secure`).
- Registrations are unauthenticated by design — add a rate limit or captcha if the teaser gets scraped.
- `data/registrations.json` from the pre-Mongo build is no longer read or written.
