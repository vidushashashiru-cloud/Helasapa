// හෙල සැප - Telegram webhook (Vercel serverless)
const crypto = require("crypto");

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || "").split(",").map((s) => s.trim());
const STORAGE_CHANNEL = process.env.STORAGE_CHANNEL_ID; // උදා: -1001234567890
const LINK_SECRET = process.env.LINK_SECRET;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const tg = (method, body) =>
  fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const sign = (id) =>
  crypto.createHmac("sha256", LINK_SECRET).update(String(id)).digest("hex").slice(0, 8);

function validCode(code) {
  const m = /^(\d{1,12})_([a-f0-9]{8})$/.exec(code || "");
  if (!m) return null;
  const a = Buffer.from(sign(m[1]));
  const b = Buffer.from(m[2]);
  return crypto.timingSafeEqual(a, b) ? Number(m[1]) : null;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(200).send("ok");
    if (req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
      return res.status(401).send("unauthorized");
    }

    const msg = req.body && req.body.message;
    if (!msg) return res.status(200).send("ok");
    const chatId = msg.chat.id;
    const fromId = String(msg.from && msg.from.id);

    // 1) User: /start CODE  -> video එක යවන්න
    if (msg.text && msg.text.startsWith("/start")) {
      const code = msg.text.split(" ")[1];
      if (!code) {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "හෙල සැප වෙබ් අඩවියෙන් link එක unlock කරලා ආපහු එන්න.",
        });
        return res.status(200).send("ok");
      }
      const mid = validCode(code);
      if (!mid) {
        await tg("sendMessage", { chat_id: chatId, text: "වලංගු නොවන link එකක්." });
        return res.status(200).send("ok");
      }
      const r = await tg("copyMessage", {
        chat_id: chatId,
        from_chat_id: STORAGE_CHANNEL,
        message_id: mid,
        protect_content: true,
      });
      if (!r.ok) {
        await tg("sendMessage", { chat_id: chatId, text: "Video එක හොයාගන්න බැහැ." });
      }
      return res.status(200).send("ok");
    }

    // 2) Admin: video එකක් upload -> storage channel එකට දාලා link එක හදන්න
    if ((msg.video || msg.document) && ADMIN_IDS.includes(fromId)) {
      const r = await tg("copyMessage", {
        chat_id: STORAGE_CHANNEL,
        from_chat_id: chatId,
        message_id: msg.message_id,
      });
      if (!r.ok) {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "Storage channel එකට දාන්න බැරි උනා. Bot එක channel admin ද බලන්න.\n" + (r.description || ""),
        });
        return res.status(200).send("ok");
      }
      const mid = r.result.message_id;
      const site = process.env.SITE_URL || `https://${req.headers.host}`;
      await tg("sendMessage", {
        chat_id: chatId,
        text: `Saved ✓\n${site}/?v=${mid}_${sign(mid)}`,
      });
    }
    return res.status(200).send("ok");
  } catch (e) {
    console.error(e);
    return res.status(200).send("error");
  }
};

