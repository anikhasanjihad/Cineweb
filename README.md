# Cinebox Web

Website version of Cinebox. Same Supabase project, same `cinehub_servers` table, same provider modules and
same Admin Panel as the app: a server added in the admin panel shows up here too.

## Deploy on Vercel
1. Vercel -> Add New -> Project -> import the this repo.
2. Root Directory: leave as default (repo root). Framework preset: Vite (auto). Deploy.
3. Optional env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` (defaults to the app's project),
   `ALLOWED_ORIGINS` (extra hosts allowed to use `/api/proxy`, e.g. a custom domain).

## Save Vercel bandwidth (optional)
Video plays straight from the video server when the stream needs no special headers, and only goes through the
proxy otherwise. To move the proxy itself off Vercel, deploy `cloudflare-worker/proxy.js` as a Cloudflare Worker
(free; it has its own steps at the top of the file), then add the Vercel env var `VITE_PROXY_URL=https://<worker>.workers.dev`
and redeploy. Without that variable nothing changes: `/api/proxy` on Vercel is used.

## Telegram Mini App
The site works as a Telegram Mini App. The bot's `/start` message has an **Open Cinebox** button that opens the app
inside Telegram (a `web_app` button: the website address is never shown to the user and is not in the message).
1. Create a bot with @BotFather and copy its token.
2. Vercel -> Settings -> Environment Variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (any long random text,
   letters/digits/`_`/`-`), optional `WEBAPP_URL` (your https site address). Redeploy.
3. Open `https://<your-site>/api/telegram?setup=<TELEGRAM_WEBHOOK_SECRET>` once. It registers the webhook, the bot's
   menu button, `/start` command and profile texts.
4. Send `/start` to the bot.

## How the proxy works
Browsers block cross-site calls and forbid User-Agent/Referer/Origin headers. Every call that provider code,
HLS segments, subtitles and plain video files make goes through `api/proxy.ts` (Vercel Edge Function), which
sends the real request from the server with the headers the provider asked for - like the app's native HTTP.

## Local
```
npm install
npm run dev      # /api/proxy is only available on Vercel (use `vercel dev` to test it locally)
```
