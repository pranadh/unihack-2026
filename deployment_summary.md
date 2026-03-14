# Deployment Summary (Karachordy Backend on DigitalOcean)

## Why this exists
To avoid stale deploys (service restarts without pulling latest code), and to keep backend updates repeatable.

## Golden Rule
Always run `git pull --ff-only` in `/opt/karachordy` before rebuilding/restarting backend.

## Standard Backend Update Workflow
Run these on VPS as `root` (or with `sudo` where needed):

```bash
set -euo pipefail

cd /opt/karachordy
git fetch origin
git checkout main
git pull --ff-only origin main

cd /opt/karachordy/backend
npm ci
npm run build

sudo systemctl restart karachordy-backend
sudo systemctl status karachordy-backend --no-pager

curl -fsS http://127.0.0.1:4000/api/health
```

## Post-Deploy Verification (required)
1. Confirm deployed commit:

```bash
cd /opt/karachordy
git rev-parse --short HEAD
git log -1 --oneline
```

2. Confirm lookup endpoint exists (guards against stale backend build):

```bash
curl -i "http://127.0.0.1:4000/api/requests/lookup?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

- Expected: HTTP `200` with JSON (`found: true/false`).
- If HTTP `404`, you are on an outdated backend build or wrong process.

3. Confirm request lifecycle:

```bash
CREATE=$(curl -sS -X POST "http://127.0.0.1:4000/api/requests" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}')
echo "$CREATE"
REQ_ID=$(node -e "const o=JSON.parse(process.argv[1]);console.log(o.id||'')" "$CREATE")
curl -sS "http://127.0.0.1:4000/api/requests/$REQ_ID"
curl -sS "http://127.0.0.1:4000/api/requests/$REQ_ID/timeline"
```

## If `git pull --ff-only` fails
- You have local changes/divergence on VPS.
- Inspect first:

```bash
cd /opt/karachordy
git status
git log --oneline --decorate --graph -20
```

- Keep only runtime config local (for example, `/opt/karachordy/backend/.env`, which is not tracked).
- Avoid editing tracked app source directly on VPS.

## Operational Notes
- Keep ChordMini private on loopback (`127.0.0.1:5001`).
- Backend should run on `0.0.0.0:4000`.
- Use logs during deploy verification:

```bash
sudo journalctl -u karachordy-backend -f -n 200
```

## Quick Daily Update (short form)
```bash
cd /opt/karachordy && git pull --ff-only origin main && cd backend && npm ci && npm run build && sudo systemctl restart karachordy-backend && curl -fsS http://127.0.0.1:4000/api/health
```
