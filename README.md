# Pixel HQ — Mission Control

A single-file dashboard for all projects: **ProofBase**, **QuoteBake**, **Furbase**,
**Driving App** and **Aisle**. It lives in this repo because the old Aisle wedding
prototype is no longer needed (it's still in git history if ever wanted).

Open `index.html` in a browser — no build step, no server, no dependencies.

## What's on it

| Panel | What it does |
|---|---|
| **The Office** | Habbo-style isometric pixel room. One desk per project; agents type when a project is in active development, idle when it's live, sleep when it's an idea. Click a desk for quick links into that project. There is also a cat. |
| **Projects** | Card per project with status, current phase, and buttons into the app, its **admin panel**, Supabase/Stripe/Vercel dashboards and the GitHub repo. Click *✎ edit links* to fix any URL — overrides persist. |
| **To-dos** | One list across every project, grouped by project, seeded with the real outstanding work (QuoteBake Phases 4–6, ProofBase CI secrets, etc.). Add / tick / delete; persisted. |
| **Claude usage left** | Session (5h window) + weekly bars with live reset countdowns. There's no public usage API, so it's a manual tracker — click **edit** and copy the numbers from `/status` in Claude Code. |
| **Stats** | Users / MRR / revenue per project. Click any number to update it. Placeholder values until wired to Stripe + each app's DB. |
| **Marketing** | Campaign list (click status to cycle planned → active → done), channel checklist, and an idea backlog. |

## Data

Everything you change (todos, stats, usage, campaigns, link overrides) is stored in
`localStorage` under `pixelhq-state-v1` — per-browser, nothing leaves your machine.
To reset to seeds: `localStorage.removeItem('pixelhq-state-v1')` in the console.

Project definitions (names, colours, links, status) are in the `PROJECTS` array at
the top of the `<script>` block in `index.html` — edit there to add a project, give
it a desk in `DESKS`, and everything else picks it up automatically.

## Later

- Wire stats to real sources (Stripe API, Supabase, QuoteBake Postgres) via a tiny
  serverless proxy.
- Deploy somewhere private (Vercel password-protected, or behind basic auth on the 20i VPS).
