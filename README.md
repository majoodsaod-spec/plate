# Plate: setup (accounts, sync, daily backup)

Three pieces: the **app** (static files), the **server** (one Cloudflare Worker) and the **database** (Cloudflare D1). All free.

## 1. Database (D1)
1. Cloudflare dashboard -> Storage & databases -> D1 SQL database -> Create database -> name it `plate-db`.
2. Open it -> Console tab -> paste the whole content of `worker/schema.sql` -> Execute.

## 2. Server (Worker)
1. Workers & pages -> your `plate-proxy` Worker -> Edit code -> replace everything with `worker/worker.js` -> Deploy.
2. Worker -> Bindings -> Add -> D1 database -> Variable name `DB` -> pick `plate-db` -> Deploy.
3. Worker -> Settings -> Trigger events -> Cron Triggers -> Add -> `0 9 * * *` (09:00 UTC = 12:00 in Qatar). This is the daily backup.
4. Secrets (Settings -> Variables and Secrets): `GEMINI_API_KEY` (required), `GROQ_API_KEY`, `TAVILY_API_KEY`, `FDC_API_KEY` (optional), `INVITE_CODE` (recommended: people need this code to create an account, so strangers cannot use your free AI quota).
   `PLATE_PASSPHRASE` is no longer used; delete it.
5. Optional variables: `AI_DAILY_LIMIT` (AI requests per person per day, default 150), `BACKUP_DAYS` (default 30), `ALLOWED_ORIGIN` (your app address).

## 3. App
Put your Worker address in `config.js` (`window.PLATE_API = 'https://plate-proxy.yourname.workers.dev'`), upload every file in this folder except `worker/` and `README.md` to Cloudflare Pages, and open it.

## Using it
- iPhone: Safari -> Share -> Add to Home Screen, then open Plate **from the home screen** and sign in there (Safari and the installed app keep separate storage).
- Android: Chrome -> menu -> Install app (or the "Install the app" button in Settings). Sign in inside it.
- Every new person: Create account. Save the recovery code shown once: it is the only way to reset a forgotten password (there is no email reset).
- You stay signed in: the login is renewed each time you use the app. You are only signed out if you tap Sign out, change your password elsewhere, or do not open the app for over a year.
- Your data is stored on the phone first (works offline) and syncs to your account whenever there is a connection.
- Backups: every day at 12:00 Qatar time, kept 30 days. Settings -> Daily backup -> Restore.
- Photos: the camera button on the Today tab opens the camera or photo library on iPhone and Android.
- When you change app files, bump `VERSION` in `sw.js`.

## 5. Optional: Sign in with Google
1. console.cloud.google.com -> create a project -> APIs & Services -> OAuth consent screen (External, app name Plate, your email) -> Publish app.
2. Credentials -> Create credentials -> OAuth client ID -> Web application -> Authorized JavaScript origins: add your app address (e.g. `https://plate.yourname.workers.dev`, no trailing slash) -> Create. Copy the Client ID.
3. Worker -> Settings -> Variables and Secrets -> add `GOOGLE_CLIENT_ID` = that Client ID (plain text) -> Deploy.

## 6. Optional: email codes (verify new accounts, reset password by email)
1. resend.com -> sign up (free) -> API Keys -> create one.
2. Worker -> Variables and Secrets -> add secret `RESEND_API_KEY`. Optionally `MAIL_FROM` = `Plate <hello@yourdomain.com>` once you have verified a domain in Resend.
3. Without a verified domain Resend only delivers to the email you signed up to Resend with, so codes would not reach other people. Leave this off until you have a domain.
Also run the new lines at the bottom of `worker/schema.sql` in the D1 console (the `ident` and `otps` tables).

## Deploying
Pushing to `main` deploys the app (the `public/` folder) to the Cloudflare Worker `plate`. The server in `worker/` is pasted into `plate-proxy` by hand.
