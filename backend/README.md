# Secure File Sharing — Backend

Node.js + Express backend for the Secure File Sharing platform. Uses Supabase
Postgres for file metadata and Supabase Storage for file bytes. Anonymous
uploads: anyone can upload a file and receive a share link plus a private owner
token used to delete it later.

## Prerequisites

- Node.js 20+ and npm
- A free Supabase project (https://supabase.com)

## Supabase setup (one-time, manual)

1. **Create a project** at https://supabase.com (free tier is fine).
2. **Storage bucket** – In the dashboard go to *Storage → New bucket*:
   - Name: `uploads`
   - Public: **off** (must stay private; the backend issues signed URLs)
3. **Database schema** – Open *SQL editor → New query* and run:

   ```sql
   create extension if not exists "pgcrypto";

   create table files (
     id              uuid primary key default gen_random_uuid(),
     share_token     text unique not null,
     owner_token     text unique not null,
     storage_path    text not null,
     original_name   text not null,
     mime_type       text not null,
     size_bytes      bigint not null,
     password_hash   text,
     max_downloads   int,
     download_count  int not null default 0,
     expires_at      timestamptz not null,
     created_at      timestamptz not null default now()
   );

   create index files_share_token_idx on files (share_token);
   create index files_expires_at_idx  on files (expires_at);
   ```

4. **Get credentials** – In *Project Settings → API*:
   - Copy the **Project URL** into `SUPABASE_URL`.
   - Copy the **service_role** secret into `SUPABASE_SERVICE_ROLE_KEY`.
     The service role key bypasses RLS, so it must stay on the server. Never
     ship it to the browser.

## Local development

```bash
cd backend
cp .env.example .env
# Edit .env and fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev
```

The server listens on `http://localhost:4000` by default.

Health check: `GET http://localhost:4000/health`.

## Environment variables

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `PORT` | HTTP port | `4000` |
| `SUPABASE_URL` | Supabase project URL | required |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role secret (server-only) | required |
| `SUPABASE_BUCKET` | Private storage bucket name | `uploads` |
| `CORS_ORIGIN` | Allowed frontend origin(s), comma separated | `http://localhost:5173` |
| `MAX_FILE_BYTES` | Per-file upload cap | `52428800` (50 MB) |
| `DEFAULT_EXPIRY_DAYS` | Default share-link lifetime | `7` |
| `MAX_EXPIRY_DAYS` | Hard cap on requested lifetime | `30` |
| `SIGNED_URL_TTL_SECONDS` | Lifetime of a signed download URL | `60` |
| `PUBLIC_SHARE_BASE_URL` | Base URL used to compose shareable links | `http://localhost:5173/s` |

## API reference

All responses are JSON. Errors are `{ "error": string }` (plus optional
`details`). All paths below are prefixed with the server origin
(`http://localhost:4000` in development).

### `POST /api/uploads`

Multipart form upload. Fields:

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `file` | file | yes | Up to `MAX_FILE_BYTES` |
| `password` | string | no | Optional password (min 4 chars) |
| `maxDownloads` | int | no | Cap on total downloads |
| `expiryDays` | int | no | Defaults to `DEFAULT_EXPIRY_DAYS`, max `MAX_EXPIRY_DAYS` |

Response `201`:

```json
{
  "shareToken": "abc123...",
  "ownerToken": "xyz789...",
  "expiresAt": "2026-05-22T13:55:00.000Z",
  "shareUrl": "http://localhost:5173/s/abc123...",
  "hasPassword": false,
  "maxDownloads": null
}
```

Keep the `ownerToken` private. Anyone who has it can delete the file.

### `GET /api/files/:shareToken`

Public metadata for the share page. Returns `404` if the share token does not
exist, has expired, or has hit its download limit.

```json
{
  "shareToken": "abc123...",
  "name": "report.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 102400,
  "hasPassword": false,
  "expiresAt": "2026-05-22T13:55:00.000Z",
  "createdAt": "2026-05-15T13:55:00.000Z",
  "downloadsLeft": null
}
```

### `POST /api/files/:shareToken/download`

Body: `{ "password": "..." }` (only required when the file is password
protected).

Verifies password (if any), expiry, and download cap. Atomically increments the
download counter, then returns a short-lived signed URL the client can follow
to download the file.

```json
{
  "url": "https://xxx.supabase.co/storage/v1/object/sign/...",
  "expiresInSeconds": 60,
  "downloadsLeft": null
}
```

### `DELETE /api/files/:shareToken`

Header: `x-owner-token: <ownerToken>`. Removes the object from storage and the
metadata row.

Returns `204 No Content` on success.

## cURL smoke test

```bash
# Upload a file (no password)
curl -sS -X POST http://localhost:4000/api/uploads \
  -F "file=@/path/to/example.txt"

# Fetch metadata (replace TOKEN with shareToken from the upload response)
curl -sS http://localhost:4000/api/files/TOKEN

# Request a signed download URL
curl -sS -X POST http://localhost:4000/api/files/TOKEN/download \
  -H "Content-Type: application/json" \
  -d '{}'

# Delete the file (replace OWNER with ownerToken from the upload response)
curl -sS -X DELETE http://localhost:4000/api/files/TOKEN \
  -H "x-owner-token: OWNER" -i
```

## Project layout

```
backend/
  src/
    server.js              # Entry point
    app.js                 # Express app + middleware wiring
    config/env.js          # Zod-validated environment config
    lib/supabase.js        # Supabase service-role client singleton
    routes/uploads.js      # POST /api/uploads
    routes/files.js        # GET / POST download / DELETE
    middleware/error.js    # 404 and central error formatter
    middleware/rateLimit.js
    utils/tokens.js        # Random URL-safe tokens, safe filenames
    utils/password.js      # bcrypt hash/verify
    utils/httpError.js     # Typed HTTP error
  .env.example
  .gitignore
  package.json
```

## Notes on security

- The `service_role` key bypasses RLS. It must only be used on the server.
- Signed URLs default to 60 seconds, so leaked URLs become useless quickly.
- Uploads are rate-limited per IP (10/min). Adjust in
  `src/middleware/rateLimit.js`.
- Passwords are hashed with bcrypt (cost 10).
- Expired or download-capped files are reported as `404` but the row is not
  deleted automatically. A scheduled cleanup job is a sensible follow-up.
