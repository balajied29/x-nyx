# NYX teaser

Two pieces:

- **the teaser** (this Next.js app) — Three.js hero, countdown to 21 August, registration form.
  When the countdown runs out the page reveals the anniversary lineup below it — five nights in
  September, in [`components/Lineup.tsx`](components/Lineup.tsx). Artist portraits go in
  `public/lineup/` (a missing one falls back to initials) and ticket links go in that file's
  `EVENTS` array (an empty one shows an inert "Tickets soon" chip). Table reservation numbers
  live in `RESERVATIONS` in [`app/page.tsx`](app/page.tsx); the `tel:` links are derived from them.

  Three query flags for previewing it without waiting: `?preview=revealed` for the aftermath,
  `?preview=reveal` to replay the moment itself a couple of seconds after load — which works
  however late it is, so the run can still be shown to the venue — and `?preview=registered` for
  the post-signup state.
- **[`server/`](server/README.md)** — Express + MongoDB service that stores registrations and serves
  the signup dashboard at [`/dashboard`](http://localhost:3000/dashboard)

Run both: `npm run dev` here, and `npm start` in `server/` (needs MongoDB and a `server/.env` —
see [server/README.md](server/README.md)). The Next app proxies `/dashboard` and `/api/admin/*` to
the service, and `/api/register` forwards signups to it.

**On Vercel** they are two projects from this one repo: the teaser (Root Directory `.`) and the
service (Root Directory `server`). Set `API_ORIGIN` on the teaser project to the service's URL —
[server/README.md](server/README.md#deploying-to-vercel) has the full walkthrough.
