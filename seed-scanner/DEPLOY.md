# Seed Scanner — Railway Deployment Runbook
# ══════════════════════════════════════════
# Follow these steps in order to deploy the Phase 2 live price scanner.

## Step 1: Create Neon Postgres Database

1. Go to https://console.neon.tech → New Project → name it "acrelogic-seeds"
2. Copy the connection string (looks like: postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require)
3. Save it — you'll need it for Railway env vars

Optional: run schema manually first:
```bash
psql $DATABASE_URL -f AcreLogic/seed-scanner/schema.sql
```
(main.py also auto-creates tables on first boot)

---

## Step 2: Deploy to Railway

```bash
# From the AcreLogic/seed-scanner directory
cd AcreLogic/seed-scanner
railway login
railway init  # or: railway link (if project exists)
railway up
```

Or via Railway dashboard:
- New Project → Deploy from GitHub repo
- Root Directory: `AcreLogic/seed-scanner`
- Build Command: `pip install -r requirements.txt`
- Start Command: `python main.py`

---

## Step 3: Set Railway Environment Variables

In Railway → your seed-scanner service → Variables, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your Neon connection string |
| `GEMINI_API_KEY` | From https://aistudio.google.com/app/apikey |
| `ADMIN_SECRET` | Any strong random string |
| `PORT` | (Railway sets automatically — leave blank) |

---

## Step 4: Get Your Worker URL

After Railway deploys:
- Go to Railway → service → Settings → Networking → Generate Domain
- Copy the public URL (e.g. `https://seed-scanner-production.up.railway.app`)
- Test it: `curl https://your-worker.up.railway.app/health` → should return `{"status":"ok"}`

---

## Step 5: Wire Up the AcreLogic App

Edit `/Users/adairclark/Desktop/AntiGravity/AcreLogic/.env`:

```
EXPO_PUBLIC_SEED_SCANNER_URL=https://your-worker.up.railway.app
```

Redeploy AcreLogic (or just restart dev server — Expo reads .env on start).

---

## Step 6: Verify End-to-End

1. Open AcreLogic → Seed Order screen (with crops planned)
2. Tap "🤖 Shop Smart" → "🔍 Compare Prices Now"
3. Watch Railway logs: you should see scan requests coming in
4. Prices should now show vendor names + real units instead of "est."
5. Check cache: `curl https://your-worker.up.railway.app/api/seeds/cache-status`

---

## Step 7: Trigger Manual Full Scan (Warms Cache)

```bash
curl -X POST https://your-worker.up.railway.app/api/seeds/scan \
  -H "X-Admin-Secret: your-admin-secret"
```

Watch Railway logs — scan takes ~3–5 minutes for all 20 varieties × 3 vendors.
After it completes, all users get instant cached responses.

---

## Ongoing: Nightly Auto-Scan

APScheduler inside main.py fires at **02:00 UTC daily** automatically.
No cron setup needed — Railway keeps the worker alive as a persistent service.
Estimated cost: ~$10–15/mo on Railway Hobby plan.

---

## Rollback: If Worker Fails

The AcreLogic app automatically falls back to mock prices if:
- `EXPO_PUBLIC_SEED_SCANNER_URL` is blank
- The worker returns a non-200 response
- The request times out (20s)

So a worker outage = users still get estimates. No hard failure.
