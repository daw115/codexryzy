# LibreChat — Railway Deployment Guide

## Step 1 — Open the Railway Template

Go to: https://railway.app/template/librechat

Click **"Deploy Now"**.

---

## Step 2 — Fill in Environment Variables

When the template form appears, enter the following values:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | *(paste your key from console.anthropic.com)* |
| `MONGODB_URI` | *(leave blank — Railway generates this automatically)* |
| `JWT_SECRET` | `JxjtUvXUQoNqj0As8lgzZvvblHGtGUbY` |
| `JWT_REFRESH_SECRET` | `so13wUJoQnrqJHwbXJeE5e2Wvcu56sa1` |
| `ALLOW_REGISTRATION` | `true` |
| `ALLOW_SOCIAL_LOGIN` | `false` |
| `CONFIG_PATH` | `/app/librechat.yaml` |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PORT` | `3080` |

Click **"Deploy"**.

---

## Step 3 — Wait for Deployment

Railway will:
1. Provision a MongoDB instance
2. Build the LibreChat Docker image
3. Start the service

Watch progress under **Deployments > Build Logs** and **Deploy Logs**.
Expect 3–5 minutes for first deploy.

---

## Step 4 — Apply the librechat.yaml Config

After the first deploy succeeds:

1. In your Railway project, go to **Settings > Source**
2. Connect this GitHub repository (`daw115/codexryzy`, branch `claude/deploy-librechat-railway-Pud99`)
3. Railway will detect `librechat.yaml` and `railway.json` automatically.
4. Redeploy to pick up the config.

Alternatively, copy the contents of `librechat.yaml` into a Railway **Volume** or
set `CONFIG_PATH` to point to it inside the container.

---

## Step 5 — Set a Custom Domain (optional)

1. In your Railway service, go to **Settings > Networking**
2. Click **"Generate Domain"** for a free `*.up.railway.app` URL, **or**
3. Click **"Add Custom Domain"** and follow the CNAME instructions for your registrar.

---

## Step 6 — Verify the App

- Open the Railway URL in your browser.
- You should see the LibreChat login screen.
- Register a new account (registration is enabled).
- In the model selector, you should see **claude-opus-4-6** and **claude-sonnet-4-6**.

To check logs at any time:
- Railway dashboard → your service → **Deployments** → click the latest deploy → **View Logs**

---

## Configuration Summary

- **Models**: `claude-opus-4-6`, `claude-sonnet-4-6`
- **Memory**: enabled
- **Artifacts**: enabled
- **Registration**: open (set `ALLOW_REGISTRATION=false` to lock it down later)
- **Social login**: disabled
