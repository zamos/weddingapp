# HQ Galaxy — Mission Control

A single-file dashboard for all projects: **ProofBase**, **QuoteBake**, **Furbase**,
**Driving App** and **Aisle**. It lives in this repo because the old Aisle wedding
prototype is no longer needed (it's still in git history if ever wanted).

Open `index.html` in a browser — no build step, no server, no dependencies.

## What's on it

| Panel | What it does |
|---|---|
| **Galaxy Map** | Each project is a solar system. Stars pulse bright with diffraction spikes while agents are actively working; dormant projects sit dim. Data pulses and comets fly between active systems. Click a system to **warp in** — the crew card shows the project's alien agents (one per open mission) typing at consoles, idling, or hibernating, plus quick links to the app and admin panel. |
| **Charted Systems** | Card per project with status, current phase, and buttons into the app, its **admin panel**, Supabase/Stripe/Vercel dashboards and the GitHub repo. Click *✎ edit links* to fix any URL — overrides persist. |
| **Mission Log** | One to-do list across every project, grouped by project, seeded with the real outstanding work (QuoteBake Phases 4–6, ProofBase CI secrets, etc.). Add / tick / delete; persisted. Crew size on the map follows open missions. |
| **Claude Fuel Reserves** | Session (5h window) + weekly gauges with live reset countdowns. There's no public usage API, so it's a manual tracker — click **edit** and copy the numbers from `/status` in Claude Code. |
| **Telemetry** | Users / MRR / revenue per project with glowing sparklines. Click any number to update it. Placeholder values until wired to Stripe + each app's DB. |
| **Transmissions** | Campaign list (click status to cycle planned → active → done), broadcast-channel checklist, and an idea backlog. |

## Data

Everything you change (missions, telemetry, fuel, campaigns, link overrides) is stored
in `localStorage` under `pixelhq-state-v1` (key kept from earlier versions so nothing
is lost) — per-browser, nothing leaves your machine.
To reset to seeds: `localStorage.removeItem('pixelhq-state-v1')` in the console.

Project definitions (names, colours, links, status, system position on the map) are in
the `PROJECTS` array at the top of the `<script>` block in `index.html` — add a project
there with a `sys:{x,y,planets}` position and everything else picks it up automatically.

## Later

- Wire telemetry to real sources (Stripe API, Supabase, QuoteBake Postgres) via a tiny
  serverless proxy.
- Deploy somewhere private (Vercel password-protected, or behind basic auth on the 20i VPS).
