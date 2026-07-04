# Self-hosting HQ Galaxy on Proxmox — complete beginner guide

By the end of this you'll have the dashboard running 24/7 in a tiny Linux container on your
Proxmox box, reachable from any device at home at `http://<container-ip>:4560`, protected by a
password, starting itself automatically after reboots — and optionally reachable from your phone
anywhere via Tailscale.

Total time: ~30 minutes. You'll copy-paste every command; nothing here assumes prior Linux
experience. Where a step happens in the **Proxmox web page**, it says so; everything else is
typed into the **container's console**.

---

## Step 1 — Create the container (Proxmox web UI)

A container (LXC) is like a very light virtual machine — perfect for this.

1. Open the Proxmox web UI (`https://<your-proxmox-ip>:8006`).
2. **Download a template** (one-time): in the left tree click your node (e.g. `pve`) →
   **local** storage → **CT Templates** → **Templates** button → find **debian-12-standard**
   → **Download**.
3. Click **Create CT** (top right) and walk the wizard:
   - **General**: Hostname `hq-galaxy` · set a root password you'll remember ·
     leave "Unprivileged container" ✔ ticked.
   - **Template**: pick `debian-12-standard`.
   - **Disks**: 8 GB is plenty.
   - **CPU**: 1 core. **Memory**: 1024 MB.
   - **Network**: leave the defaults, set **IPv4 = DHCP**.
   - Finish → tick **Start after created**.
4. Select the new container → **Summary** and note its **IP address** (e.g. `192.168.1.87`).
   You'll use this IP everywhere below.
5. *Recommended*: log into your router and give this container a **DHCP reservation** (a.k.a.
   static lease) so the IP never changes. It's usually under DHCP settings → reserve by MAC
   address.

## Step 2 — Install what it needs (container console)

Select the container in Proxmox → **Console** → log in as `root` with the password you set.
Then paste, one block at a time:

```bash
# basics
apt update && apt install -y git curl ca-certificates

# Node.js 22 (from NodeSource — Debian's own version is too old)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node --version    # should print v22.x

# a non-root user to run the dashboard
useradd -m -s /bin/bash hq
```

## Step 3 — Get the code

The repo is private, so GitHub needs to know it's you. Create a token:

1. On github.com: your avatar → **Settings** → **Developer settings** →
   **Fine-grained personal access tokens** → **Generate new token**.
2. Name `hq-galaxy-server`, expiry 1 year, **Only select repositories** → pick `zamos/weddingapp`
   (add your other project repos too if you want Bridge to work on them — see Step 6).
3. Under **Repository permissions** set **Contents: Read-only**. Generate, copy the token
   (starts `github_pat_…`).

Back in the container console (replace `TOKEN` with yours):

```bash
git clone https://TOKEN@github.com/zamos/weddingapp /opt/hq-galaxy
cd /opt/hq-galaxy
git checkout claude/project-dashboard-system-349d7l   # until it's merged to main
cp .env.example .env
chown -R hq:hq /opt/hq-galaxy
```

Now edit the settings file:

```bash
nano /opt/hq-galaxy/.env
```

Make it look like this (pick your own password!), then save with **Ctrl+O, Enter, Ctrl+X**:

```ini
HOST=0.0.0.0
HQ_PASSWORD=pick-a-long-password-here
PROJECTS_ROOT=/opt/projects
# optional, for live revenue in Telemetry:
#STRIPE_SECRET_KEY=sk_live_...
#VERCEL_TOKEN=...
```

`HOST=0.0.0.0` means "answer other devices on the network, not just this container" — that's
why the password line is not optional. Also create the projects folder:

```bash
mkdir -p /opt/projects && chown hq:hq /opt/projects
```

## Step 4 — Run it as a service (starts on boot, restarts if it crashes)

```bash
cp /opt/hq-galaxy/deploy/hq-galaxy.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now hq-galaxy
systemctl status hq-galaxy    # want: "active (running)" in green — press q to exit
```

**Now open `http://<container-ip>:4560` from any device at home.** You'll get the password
gate, then the galaxy. 🎉

Useful commands for later:

```bash
journalctl -u hq-galaxy -f        # live logs (Ctrl+C to stop watching)
systemctl restart hq-galaxy       # restart after config changes
```

## Step 5 — Dashboard first-run

In the dashboard: **⚙ Settings → Connections** → paste your GitHub token (the same one, or a
second read-only one) → **test** should show your username. Stars now run on live commit data.

Note: settings/tokens/todos are stored per-browser. Do it once on your main browser and use
**export JSON** as a backup you can import elsewhere.

## Step 6 — Make The Bridge work on the server (optional, recommended)

The Bridge runs prompts through Claude Code, so the container needs the `claude` CLI logged in,
plus your project code to work on:

```bash
su - hq                            # become the hq user (important!)
curl -fsSL https://claude.ai/install.sh | bash
exec bash                          # reload PATH
claude                             # follow the login link with your subscription, then /exit

# give Bridge real codebases to work in (use your token again):
cd /opt/projects
git clone https://TOKEN@github.com/zamos/quotebake
git clone https://TOKEN@github.com/zamos/proofbase
# ...etc
exit                               # back to root
systemctl restart hq-galaxy
```

Then in the dashboard, edit each system (⚙ → edit) and set **Local folder** to e.g.
`/opt/projects/quotebake`. The Bridge picker lights up for those projects.

Two honest caveats:
- **Fuel gauges on the server count the server's own usage** (the same account limits apply,
  but usage from your laptop isn't visible to the container and vice versa).
- **"Full power" mode** lets Claude run anything the `hq` user can. On a home box that's
  usually fine — but that's what the safe/plan modes are for.

## Step 7 — Access from outside home (optional): Tailscale

Do **not** port-forward this to the internet — it's a tool that can run code, a password gate
is not enough for public exposure. Tailscale gives you a private VPN between your devices in
three commands:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up          # open the printed link, sign in (free for personal use)
tailscale ip -4       # note the 100.x.x.x address
```

Install the Tailscale app on your phone/laptop, sign into the same account, and the dashboard
is at `http://100.x.x.x:4560` from anywhere.

## Updating to a newer version

```bash
cd /opt/hq-galaxy && git pull && systemctl restart hq-galaxy
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Page doesn't load at all | `systemctl status hq-galaxy` — if not green, `journalctl -u hq-galaxy -n 50` shows why. Check the container IP hasn't changed (Step 1.5). |
| Loads on the Proxmox host but not other devices | `.env` is missing `HOST=0.0.0.0`, or you edited it and didn't `systemctl restart hq-galaxy`. |
| Password page loops | Cookies blocked for plain-http sites in your browser — allow cookies for the IP, or use Bearer auth for API tools. |
| "claude CLI NOT FOUND" in logs | Step 6 wasn't done as the `hq` user, or the service was started before the install — restart the service. |
| GitHub test fails | Token expired or missing repo access — regenerate with Contents: Read-only on the right repos. |
| Sync dot red | Open ⚙ → test buttons to see which token is failing. |
