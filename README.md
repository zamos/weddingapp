# HQ Galaxy — Mission Control

The command centre for everything: **ProofBase**, **QuoteBake**, **Furbase**, **Driving App**,
and whatever you chart next. Each project is a solar system in an explorable galaxy; the whole
thing runs on live data and can launch real Claude sessions.

## Quick start

```bash
git clone https://github.com/zamos/weddingapp && cd weddingapp
npm start          # zero dependencies — just Node 18+
# open http://localhost:4560
```

Then in the dashboard: **⚙ Settings → Connections** and paste a GitHub token
(github.com → Settings → Developer settings → Fine-grained tokens → read-only access to your
repos). Optionally a Vercel token too. For Stripe revenue, `cp .env.example .env` and add
`STRIPE_SECRET_KEY` (server-side only — secrets never reach the browser).

## What it does

| Thing | How |
|---|---|
| **Galaxy map** | Drag to pan, scroll to zoom. Every project is a star system: textured planets with rings/moons/terminators are your **links** (app, admin panel, repo, dashboards) — hover for a tooltip, click to open. Asteroid belts = open missions. Stars burn bright and flare when there's real commit activity; comets and data pulses fly between active systems; a red halo means the latest deploy failed. |
| **Warp in** | Click a star → warp animation into the system: giant sun, big clickable planets, the alien crew (one per open mission — typing, idling or hibernating), a live activity feed of commits/deploys, and buttons for admin/app/repo + *run prompt*. Esc or ← galaxy to warp out. |
| **Auto data** | Polls every 3 minutes: GitHub commits/issues (activity, mission counts, crew speech = real commit messages), Claude usage parsed from `~/.claude` local data (fuel gauges — no manual input), Vercel deploy states, Stripe subs/MRR/30-day revenue. Header dot = sync health. |
| **The Bridge** | Bottom drawer (press `` ` ``). Pick a project, type a prompt, hit Run — the server spawns `claude -p` in that project's folder and streams output live. Modes: safe (accept edits) / plan only / full power. **🚀 new project** creates a folder under your projects root, `git init`s it, writes a `CLAUDE.md`, adds it to the galaxy, and optionally fires a kickoff prompt. |
| **Customise everything** | ⚙ Settings: add/edit/delete systems (name, colour, icon, links, repo, local path, Vercel project, Stripe flag), ARRANGE MODE to drag stars around the map, fuel limit tuning, JSON export/import backup. |
| **Missions / Telemetry / Transmissions** | Cross-project todo log (merged with GitHub issue counts), per-project stats + live Stripe card, marketing campaigns/channels/ideas. |

## Architecture

```
server.js          zero-dependency Node companion server (binds 127.0.0.1 only)
public/
  index.html       shell + panels + modals
  style.css        starship theme
  app.js           state, migration, data sync, settings, Bridge console
  galaxy.js        canvas engine: camera, planet sprites, warp, crew
```

### API (all local)

| Endpoint | Does |
|---|---|
| `GET /api/health` | feature detection for the frontend |
| `GET /api/usage` | Claude tokens per 5h block + trailing week, parsed from `~/.claude/projects/**/*.jsonl` |
| `POST /api/run` | `claude -p <prompt> --output-format stream-json` in a project dir, streamed back as SSE |
| `POST /api/kill` | stop a running prompt |
| `POST /api/new-project` | scaffold folder + git init + CLAUDE.md under `PROJECTS_ROOT` |
| `GET /api/vercel?project=` | latest deployment state (token from UI header or `.env`) |
| `GET /api/stripe/summary` | active subs, MRR, 30d revenue (key from `.env` only) |
| `GET /api/ping?url=` | reachability check |

## Static fallback

`public/index.html` still works opened straight from disk: GitHub sync runs browser-side, the
galaxy is fully interactive, and the Run button falls back to opening claude.ai with your
prompt pre-filled. A banner tells you you're in static mode.

## Notes & knobs

- **Data**: persisted in `localStorage` (`pixelhq-state-v1`) — export a JSON backup from Settings.
- **Fuel accuracy**: Anthropic doesn't publish plan token limits, so gauges measure real usage
  against the limits in Settings — tune them until they track `/status`.
- **Security**: server binds `127.0.0.1` only; prompt runs are restricted to your home /
  projects root; `.env` is gitignored; the browser never sees Stripe keys.
- **Projects root**: defaults to the parent folder of this repo; override with `PROJECTS_ROOT` in `.env`.
