# Deployment guide

This project ships as two services that you deploy separately, both from the
same GitHub repo (`apih99/secure-file-sharing`):

| Service  | Hosting | What it is                          | Free tier        |
| -------- | ------- | ----------------------------------- | ---------------- |
| Frontend | Vercel  | Vite + React static site            | Generous, fast   |
| Backend  | Render  | Node.js + Express API               | Sleeps after 15m |
| Storage  | Supabase| Postgres + private bucket `uploads` | Already set up   |

There is a circular dependency in the URLs (backend needs the Vercel domain for
CORS, frontend needs the Render domain for API calls). The order below resolves
it cleanly:

1. Deploy backend to Render (with placeholder CORS).
2. Deploy frontend to Vercel using the Render URL.
3. Update backend env on Render with the real Vercel URL and redeploy.

---

## 0. Prerequisites

- GitHub remote is already set: `https://github.com/apih99/secure-file-sharing`.
- Your Supabase project is already configured (bucket `uploads`, `files`
  table). You will reuse the same URL and `service_role` key in production.
- Decide which branch you want to deploy from. Currently your work is on
  `backend-setup`. The simplest path is:

  ```bash
  git checkout main
  git merge backend-setup
  git push origin main
  ```

  Both Render and Vercel let you pick the branch in their dashboard, so you
  can also deploy directly from `backend-setup` if you prefer.

Push any local changes first:

```bash
git add .
git commit -m "Prepare for deployment"
git push
```

---

## 1. Deploy the backend to Render

1. Sign in at https://dashboard.render.com.
2. Click **New +** -> **Web Service**.
3. **Connect a repository** and pick `apih99/secure-file-sharing`.
4. Fill in the form:

   | Field             | Value                                |
   | ----------------- | ------------------------------------ |
   | Name              | `secure-file-sharing-api` (anything)  |
   | Region            | Closest to your users                |
   | Branch            | `main` (or `backend-setup`)          |
   | **Root Directory**| `backend`                            |
   | Runtime           | Node                                 |
   | Build Command     | `npm install`                        |
   | Start Command     | `npm start`                          |
   | Instance Type     | Free                                 |

5. Scroll down to **Environment Variables** and add:

   | Key                          | Value                                                             |
   | ---------------------------- | ----------------------------------------------------------------- |
   | `SUPABASE_URL`               | from your Supabase project's API settings                         |
   | `SUPABASE_SERVICE_ROLE_KEY`  | the `service_role` key (server-only, never expose)                |
   | `SUPABASE_BUCKET`            | `uploads`                                                         |
   | `CORS_ORIGIN`                | `http://localhost:5173` (placeholder; update after step 2)        |
   | `MAX_FILE_BYTES`             | `52428800`                                                        |
   | `DEFAULT_EXPIRY_DAYS`        | `7`                                                               |
   | `MAX_EXPIRY_DAYS`            | `30`                                                              |
   | `SIGNED_URL_TTL_SECONDS`     | `60`                                                              |
   | `PUBLIC_SHARE_BASE_URL`      | `http://localhost:5173/s` (placeholder; update after step 2)      |

   Notes:

   - **Do not** set `PORT`. Render injects it automatically and the app reads
     it from `process.env.PORT`.
   - `CORS_ORIGIN` accepts a comma-separated list, e.g.
     `https://your-frontend.vercel.app,http://localhost:5173`.

6. Click **Create Web Service**. Render will build and start the API. First
   build takes a couple of minutes.

7. When the status flips to **Live**, copy the URL Render assigned you. It
   looks like:

   ```
   https://secure-file-sharing-api.onrender.com
   ```

   Verify it works:

   ```bash
   curl https://secure-file-sharing-api.onrender.com/health
   # {"status":"ok","uptime":...}
   ```

Free-tier note: Render's free web service sleeps after 15 minutes without
traffic. The next request takes ~30-60s to wake. Subsequent requests are fast.

---

## 2. Deploy the frontend to Vercel

1. Sign in at https://vercel.com.
2. Click **Add New...** -> **Project** and import
   `apih99/secure-file-sharing`.
3. Vercel auto-detects the framework as **Vite**. Leave the defaults:

   | Field              | Value                                  |
   | ------------------ | -------------------------------------- |
   | Framework Preset   | Vite                                   |
   | Root Directory     | `./` (repo root)                       |
   | Build Command      | `npm run build`                        |
   | Output Directory   | `dist`                                 |
   | Install Command    | `npm install`                          |

4. Expand **Environment Variables** and add:

   | Key                  | Value (from step 1)                              |
   | -------------------- | ------------------------------------------------ |
   | `VITE_API_BASE_URL`  | `https://secure-file-sharing-api.onrender.com`   |

   Apply this to **Production**, **Preview**, and **Development**.

5. Click **Deploy**. After ~1 minute the project gets a URL like:

   ```
   https://secure-file-sharing.vercel.app
   ```

The repo already has [vercel.json](vercel.json) at the root which rewrites
unknown paths back to `/` so client-side routes such as `/s/<token>` work
after a hard refresh.

---

## 3. Close the loop: update backend env

Now that you have the real Vercel domain, go back to Render -> your service ->
**Environment** and update the placeholders:

| Key                       | New value                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `CORS_ORIGIN`             | `https://secure-file-sharing.vercel.app` (add `,http://localhost:5173` if you want local dev to keep working against prod) |
| `PUBLIC_SHARE_BASE_URL`   | `https://secure-file-sharing.vercel.app/s`                                           |

Render will redeploy automatically after the env change. Wait for **Live**.

---

## 4. Smoke test the live setup

Replace the hostnames with yours.

```bash
# Health
curl https://secure-file-sharing-api.onrender.com/health

# CORS preflight (should return 204 with the Vercel origin allowed)
curl -X OPTIONS https://secure-file-sharing-api.onrender.com/api/uploads \
  -H "Origin: https://secure-file-sharing.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" -i | head -10
```

Then open `https://secure-file-sharing.vercel.app`:

- Upload a file. The share URL it produces should now have the Vercel domain.
- Open the share URL in a fresh tab (or share it with a friend) and confirm
  the recipient page loads and the download works.
- In Supabase: confirm the file appears in the `uploads` bucket and a row
  shows up in the `files` table.

---

## Recap: environment variable matrix

### Render (backend)

| Variable                  | Production value                                       |
| ------------------------- | ------------------------------------------------------ |
| `SUPABASE_URL`            | your Supabase project URL                              |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role secret (server-only)                    |
| `SUPABASE_BUCKET`         | `uploads`                                              |
| `CORS_ORIGIN`             | `https://<your>.vercel.app[,http://localhost:5173]`    |
| `MAX_FILE_BYTES`          | `52428800`                                             |
| `DEFAULT_EXPIRY_DAYS`     | `7`                                                    |
| `MAX_EXPIRY_DAYS`         | `30`                                                   |
| `SIGNED_URL_TTL_SECONDS`  | `60`                                                   |
| `PUBLIC_SHARE_BASE_URL`   | `https://<your>.vercel.app/s`                          |

Do **not** set `PORT`; Render injects it.

### Vercel (frontend)

| Variable             | Production value                                  |
| -------------------- | ------------------------------------------------- |
| `VITE_API_BASE_URL`  | `https://<your>.onrender.com`                     |

Anything prefixed `VITE_` is inlined into the client bundle at build time, so
do not put secrets here.

---

## Troubleshooting

- **CORS error in the browser** ("blocked by CORS policy"): the Render
  `CORS_ORIGIN` does not match the Vercel domain exactly. Check protocol
  (`https`), no trailing slash, no whitespace.
- **Long delay on first upload**: Render free tier was asleep. Wait ~30-60s
  and try again, or upgrade to a paid instance.
- **`404 Not Found` when opening a share URL directly**: missing or broken
  `vercel.json` rewrite. The file at [vercel.json](vercel.json) handles this
  for you; make sure it is committed.
- **`Invalid environment configuration` in Render logs**: a required env var
  is missing or malformed. Render logs the field name; fix it under
  Environment and the service will restart.
- **Share URL still points at `localhost`**: `PUBLIC_SHARE_BASE_URL` on Render
  was not updated to the Vercel domain. Update it and trigger a redeploy.

---

## Optional: custom domain

Both Render and Vercel support custom domains on the free tier.

- Add the domain in the Vercel dashboard, then in Render update
  `CORS_ORIGIN` to include it, and `PUBLIC_SHARE_BASE_URL` to use it.
- The backend doesn't strictly need a custom domain; `*.onrender.com` works
  fine.
