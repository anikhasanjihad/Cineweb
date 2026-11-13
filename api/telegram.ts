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

const env = (k: string): string => String(((globalThis as any).process?.env?.[k]) ?? '').trim();

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {status, headers: {'content-type': 'application/json', 'cache-control': 'no-store'}});

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
  const set = env('WEBAPP_URL').replace(/\/+$/, '');
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
  const token = env('TELEGRAM_BOT_TOKEN');
  const secret = env('TELEGRAM_WEBHOOK_SECRET');
  if (!token || !secret) return json({ok: false, error: 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in Vercel, then redeploy.'}, 500);

  // ---------- one-time setup ----------
  if (req.method === 'GET') {
    const key = new URL(req.url).searchParams.get('setup') ?? '';
    if (!key || !same(key, secret)) return json({ok: false, error: 'Not allowed'}, 403);
    const url = appUrl(req);
    const origin = new URL(req.url).origin;
    const out: Record<string, unknown> = {};
    out.webhook = await call(token, 'setWebhook', {url: `${origin}/api/telegram`, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true});
    out.menuButton = await call(token, 'setChatMenuButton', {menu_button: {type: 'web_app', text: 'Open', web_app: {url}}});
    out.commands = await call(token, 'setMyCommands', {commands: [{command: 'start', description: 'Open Cinebox'}]});
    out.shortDescription = await call(token, 'setMyShortDescription', {short_description: 'Movies, series and live TV in one app.'});
    out.description = await call(token, 'setMyDescription', {description: '🎬 Cinebox\n\nWatch movies, series and live TV right inside Telegram. Press START to begin.'});
    return json(out);
  }

  // ---------- Telegram webhook ----------
  if (req.method !== 'POST') return json({ok: false}, 405);
  if (!same(req.headers.get('x-telegram-bot-api-secret-token') ?? '', secret)) return json({ok: false}, 403);

  let update: any;
  try { update = await req.json(); } catch { return json({ok: true}); }
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  const text = String(msg?.text ?? '');
  if (!chatId) return json({ok: true});

  if (/^\/(start|app|open|help)(@\w+)?(\s|$)/i.test(text)) {
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
    if (!photo.ok) await call(token, 'sendMessage', {chat_id: chatId, text: caption, parse_mode: 'HTML', reply_markup: markup});
  }
  return json({ok: true});
}
