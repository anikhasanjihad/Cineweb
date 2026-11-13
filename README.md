# Cinebox Web

Website version of Cinebox. Same Supabase project, same `cinehub_servers` table, same provider modules and
same Admin Panel as the app: a server added in the admin panel shows up here too.

## Deploy on Vercel
1. Vercel -> Add New -> Project -> import the this repo.
2. Root Directory: leave as default (repo root). Framework preset: Vite (auto). Deploy.
3. Optional env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` (defaults to the app's project),
   `ALLOWED_ORIGINS` (extra hosts allowed to use `/api/proxy`, e.g. a custom domain).

## How the proxy works
Browsers block cross-site calls and forbid User-Agent/Referer/Origin headers. Every call that provider code,
HLS segments, subtitles and plain video files make goes through `api/proxy.ts` (Vercel Edge Function), which
sends the real request from the server with the headers the provider asked for - like the app's native HTTP.

## Local
```
npm install
npm run dev      # /api/proxy is only available on Vercel (use `vercel dev` to test it locally)
```
