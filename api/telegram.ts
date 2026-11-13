// Vercel Edge Function: the Telegram bot for the Cinebox Mini App.
//
//  - POST /api/telegram           Telegram calls this for every message (webhook). /start gets a welcome
//                                 message with an "Open Cinebox" button.
//  - GET  /api/telegram?setup=KEY One-time setup: registers the webhook, the bot's menu button, commands and
//                                 profile texts. KEY is TELEGRAM_WEBHOOK_SECRET.
//
// Vercel environment variables:
//   TELEGRAM_BOT_TOKEN        token from @BotFather
//   TELEGRAM_WEBHOOK_SECRET   any long random text (letters, digits, _ and - only)
//   WEBAPP_URL                optional, your site address, e.g. https://your-site.vercel.app (default: this site)
//
// The button is a Telegram "web_app" button: it opens the app inside Telegram and never shows the website
// address to the user. The welcome message itself contains no link either.
export const config = {runtime: 'edge'};

declare const process: {env: Record<string, string | undefined>};
// Read each variable by its full name (Vercel Edge needs that).
const TOKEN = () => String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const SECRET = () => String(process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
const WEBAPP = () => String(process.env.WEBAPP_URL ?? '').trim();

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {status, headers: {'content-type': 'application/json', 'cache-control': 'no-store'}});

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Telegram only accepts A-Z a-z 0-9 _ - in a webhook secret. We never send the raw secret: we send its SHA-256
// (always valid), so any TELEGRAM_WEBHOOK_SECRET text works.
const hook = async (secret: string) => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`cinebox:${secret}`));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
};

// Tells the owner why a key was refused (only lengths, never the secret itself).
const denied = (key: string, secret: string) => json({
  ok: false,
  error: 'Not allowed',
  version: 'tg-2',
  reason: !key ? 'The link has no key after setup= / check='
    : key.length !== secret.length ? `Length differs: the link key has ${key.length} characters but TELEGRAM_WEBHOOK_SECRET in Vercel has ${secret.length}. Vercel is still using an older value, or the variable differs. Save it for Production and Redeploy.`
    : 'Same length but different letters. Check capital/small letters and 0/O, l/1.',
}, 403);

const same = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

const call = async (token: string, method: string, body: Record<string, unknown>) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({ok: false}))) as {ok: boolean; description?: string; result?: unknown};
};

const appUrl = (req: Request) => {
  const set = WEBAPP().replace(/\/+$/, '');
  if (/^https:\/\//i.test(set)) return set;
  return new URL(req.url).origin;
};

const welcome = (name: string) =>
  [
    `🎬 <b>Welcome to Cinebox${name ? `, ${esc(name)}` : ''}!</b>`,
    '',
    'Movies, series and live TV, all in one place.',
    '',
    '▸ Smooth streaming that saves your data',
    '▸ Live TV channels',
    '▸ Save your favourites to your Library',
    '',
    'Tap the button below to start watching 👇',
  ].join('\n');

const button = (url: string) => ({inline_keyboard: [[{text: '🎬 Open Cinebox', web_app: {url}}]]});

export default async function handler(req: Request): Promise<Response> {
  const token = TOKEN();
  const secret = SECRET();
  if (!token || !secret) {
    return json({
      ok: false,
      error: 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in Vercel (Settings -> Environment Variables), then Redeploy.',
      TELEGRAM_BOT_TOKEN: token ? 'set' : 'MISSING',
      TELEGRAM_WEBHOOK_SECRET: secret ? 'set' : 'MISSING',
    }, 500);
  }

  // ---------- one-time setup / health check ----------
  if (req.method === 'GET') {
    const sp = new URL(req.url).searchParams;
    const check = sp.get('check');
    if (check !== null) {
      if (!check || !same(check, secret)) return denied(check, secret);
      const me = await call(token, 'getMe', {});
      const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then(r => r.json()).catch(() => null);
      return json({
        ok: true,
        bot: (me.result as any)?.username ?? me,
        webhookSet: Boolean(info?.result?.url),
        webhookUrl: info?.result?.url ?? null,
        webhookPointsHere: info?.result?.url === `${appUrl(req)}/api/telegram`,
        pendingUpdates: info?.result?.pending_update_count,
        lastError: info?.result?.last_error_message ?? null,
        lastErrorDate: info?.result?.last_error_date ? new Date(info.result.last_error_date * 1000).toISOString() : null,
        buttonOpens: appUrl(req),
      });
    }
    if (sp.get('setup') === null) return json({ok: true, how: 'Open /api/telegram?setup=YOUR_TELEGRAM_WEBHOOK_SECRET once. To test later: /api/telegram?check=YOUR_TELEGRAM_WEBHOOK_SECRET', env: {TELEGRAM_BOT_TOKEN: 'set', TELEGRAM_WEBHOOK_SECRET: 'set'}});
    const key = sp.get('setup') ?? '';
    if (!key || !same(key, secret)) return denied(key, secret);
    const url = appUrl(req);
    const out: Record<string, unknown> = {};
    out.bot = await call(token, 'getMe', {});
    if (!(out.bot as any).ok) {
      return json({ok: false, error: 'TELEGRAM_BOT_TOKEN is wrong (Telegram rejected it). Copy the token again from @BotFather, update it in Vercel, Redeploy, then open this link again.', telegram: out.bot}, 400);
    }
    out.webhook = await call(token, 'setWebhook', {url: `${url}/api/telegram`, secret_token: await hook(secret), allowed_updates: ['message'], drop_pending_updates: true});
    out.menuButton = await call(token, 'setChatMenuButton', {menu_button: {type: 'web_app', text: 'Open', web_app: {url}}});
    out.commands = await call(token, 'setMyCommands', {commands: [{command: 'start', description: 'Open Cinebox'}]});
    out.shortDescription = await call(token, 'setMyShortDescription', {short_description: 'Movies, series and live TV in one app.'});
    out.description = await call(token, 'setMyDescription', {description: '🎬 Cinebox\n\nWatch movies, series and live TV right inside Telegram. Press START to begin.'});
    const bad = ['webhook', 'menuButton', 'commands'].filter(k => !(out[k] as any)?.ok);
    return json({ok: bad.length === 0, failed: bad, webhookUrl: `${url}/api/telegram`, buttonOpens: url, next: bad.length ? 'Something failed, see details below.' : 'Done. Open the bot in Telegram and send /start.', ...out});
  }

  // ---------- Telegram webhook ----------
  if (req.method !== 'POST') return json({ok: false}, 405);
  if (!same(req.headers.get('x-telegram-bot-api-secret-token') ?? '', await hook(secret))) return json({ok: false}, 403);

  let update: any;
  try { update = await req.json(); } catch { return json({ok: true}); }
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  const text = String(msg?.text ?? '');
  if (!chatId) return json({ok: true});

  if (text && (/^\/(start|app|open|help)(@\w+)?(\s|$)/i.test(text) || msg.chat.type === 'private')) {
    if (msg.chat.type !== 'private') {
      // Mini App buttons only work in a private chat with the bot.
      await call(token, 'sendMessage', {chat_id: chatId, text: 'Please message me privately and press /start to open Cinebox.'});
      return json({ok: true});
    }
    const url = appUrl(req);
    const caption = welcome(String(msg.from?.first_name ?? ''));
    const markup = button(url);
    // Nice welcome with the logo; if the picture can not be sent, fall back to a plain message.
    const photo = await call(token, 'sendPhoto', {chat_id: chatId, photo: `${url}/logo.png`, caption, parse_mode: 'HTML', reply_markup: markup});
    if (!photo.ok) {
      const plain = await call(token, 'sendMessage', {chat_id: chatId, text: caption, parse_mode: 'HTML', reply_markup: markup});
      if (!plain.ok) console.error('telegram sendMessage failed:', plain.description);
    }
  }
  return json({ok: true});
}
