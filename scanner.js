const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const seenPairs = new Set();
const seenPosts = new Set();
const authorizedChats = new Set([TELEGRAM_CHAT_ID]);
let totalAlerts = 0;
let startTime = Date.now();

// ─── Send to one chat ─────────────────────────────────────────────────────────

async function sendToChat(chatId, message) {
  try {
    const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });
    if (!res.ok) {
      const err = await res.text();
      console.log("[TELEGRAM] Send error:", err);
    }
  } catch (err) {
    console.log("[TELEGRAM] Error:", err.message);
  }
}

// ─── Broadcast to all users ───────────────────────────────────────────────────

async function sendTelegram(message) {
  for (const chatId of authorizedChats) {
    await sendToChat(chatId, message);
    totalAlerts++;
  }
}

// ─── Startup Message ──────────────────────────────────────────────────────────

async function sendStartupMessage() {
  const msg =
    "🤖 <b>Scanner Bot Online</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "✅ DexScreener — Active\n" +
    "✅ Reddit — Active\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "📋 <b>Commands:</b>\n" +
    "/start — Subscribe to alerts\n" +
    "/stop — Unsubscribe from alerts\n" +
    "/status — View bot stats\n" +
    "/help — List all commands\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "🟢 <b>All systems running</b>";
  await sendTelegram(msg);
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

async function sendHeartbeat() {
  const uptime = Math.floor((Date.now() - startTime) / 1000 / 60);
  const hours = Math.floor(uptime / 60);
  const minutes = uptime % 60;
  const uptimeStr = hours > 0 ? hours + "h " + minutes + "m" : minutes + "m";

  const msg =
    "📊 <b>Scanner Status Report</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "⏱ Uptime: <b>" + uptimeStr + "</b>\n" +
    "🚨 Tokens tracked: <b>" + seenPairs.size + "</b>\n" +
    "📢 Reddit posts tracked: <b>" + seenPosts.size + "</b>\n" +
    "📬 Total alerts sent: <b>" + totalAlerts + "</b>\n" +
    "👥 Active users: <b>" + authorizedChats.size + "</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "🟢 <b>Bot is running fine</b>";
  await sendTelegram(msg);
}

// ─── Handle Commands ──────────────────────────────────────────────────────────

async function handleMessage(msg) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || "").trim();
  const firstName = msg.from && msg.from.first_name ? msg.from.first_name : "there";

  if (!text) return;

  console.log("[BOT] Message from " + chatId + ": " + text);

  if (text === "/start") {
    authorizedChats.add(chatId);
    await sendToChat(chatId,
      "👋 <b>Welcome " + firstName + "!</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "✅ You are now subscribed to alerts\n" +
      "📡 You will receive:\n" +
      "  • 🚨 New token launches from DexScreener\n" +
      "  • 🔥 New launch posts from Reddit\n" +
      "  • 📊 Status reports every 30 minutes\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "📋 <b>Commands:</b>\n" +
      "/stop — Unsubscribe from alerts\n" +
      "/status — View live bot stats\n" +
      "/help — Show all commands\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "🟢 <b>Bot is active and scanning</b>"
    );
    return;
  }

  if (text === "/stop") {
    authorizedChats.delete(chatId);
    await sendToChat(chatId,
      "🔴 <b>Alerts Stopped</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "You have unsubscribed from all alerts.\n" +
      "Send /start anytime to resubscribe.\n" +
      "━━━━━━━━━━━━━━━━━━━━"
    );
    return;
  }

  if (text === "/status") {
    const uptime = Math.floor((Date.now() - startTime) / 1000 / 60);
    const hours = Math.floor(uptime / 60);
    const minutes = uptime % 60;
    const uptimeStr = hours > 0 ? hours + "h " + minutes + "m" : minutes + "m";
    await sendToChat(chatId,
      "📊 <b>Live Bot Status</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "⏱ Uptime: <b>" + uptimeStr + "</b>\n" +
      "🚨 Tokens tracked: <b>" + seenPairs.size + "</b>\n" +
      "📢 Reddit posts tracked: <b>" + seenPosts.size + "</b>\n" +
      "📬 Total alerts sent: <b>" + totalAlerts + "</b>\n" +
      "👥 Active users: <b>" + authorizedChats.size + "</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "🟢 <b>All systems running</b>"
    );
    return;
  }

  if (text === "/help") {
    await sendToChat(chatId,
      "📋 <b>Available Commands</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "/start — Subscribe to all alerts\n" +
      "/stop — Unsubscribe from alerts\n" +
      "/status — View live bot stats\n" +
      "/help — Show this message\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "📡 <b>What we scan:</b>\n" +
      "• DexScreener new token boosts\n" +
      "• Reddit launch posts across 5 subs\n" +
      "━━━━━━━━━━━━━━━━━━━━"
    );
    return;
  }

  // Unknown command
  await sendToChat(chatId,
    "❓ <b>Unknown command</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "Send /help to see all available commands.\n" +
    "━━━━━━━━━━━━━━━━━━━━"
  );
}

// ─── Poll for Updates ─────────────────────────────────────────────────────────

async function pollUpdates() {
  let offset = 0;
  while (true) {
    try {
      const res = await fetch(
        "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN +
        "/getUpdates?offset=" + offset + "&timeout=30"
      );
      const data = await res.json();

      if (data.result && data.result.length > 0) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          if (update.message) {
            await handleMessage(update.message);
          }
        }
      }
    } catch (err) {
      console.log("[POLL] Error:", err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ─── DexScreener Scanner ──────────────────────────────────────────────────────

async function scanDex() {
  try {
    const res = await fetch("https://api.dexscreener.com/token-boosts/latest/v1");
    const text = await res.text();

    if (text.startsWith("<!") || text.startsWith("<")) {
      console.log("[DEX] API returned HTML, skipping...");
      return;
    }

    const data = JSON.parse(text);
    let newCount = 0;

    for (const token of data) {
      if (seenPairs.has(token.tokenAddress)) continue;
      seenPairs.add(token.tokenAddress);
      newCount++;

      const socials = [];
      if (token.links) {
        for (let i = 0; i < token.links.length; i++) {
          if (token.links[i].url) socials.push(token.links[i].url);
        }
      }

      const chain = token.chainId ? token.chainId.toUpperCase() : "Unknown";
      const chainEmoji =
        chain === "SOLANA" ? "🟣" :
        chain === "ETHEREUM" ? "🔷" :
        chain === "BSC" ? "🟡" :
        chain === "BASE" ? "🔵" :
        chain === "ARBITRUM" ? "🔶" : "🔗";

      let msg =
        "🚨 <b>New Token Detected</b>\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "📛 Name: <b>" + (token.description || "Unknown") + "</b>\n" +
        chainEmoji + " Chain: <b>" + chain + "</b>\n" +
        "📋 Contract:\n<code>" + token.tokenAddress + "</code>\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "🔍 <a href='" + (token.url || "https://dexscreener.com") + "'>View on DexScreener</a>";

      if (socials.length > 0) {
        msg += "\n\n🌐 <b>Socials:</b>";
        for (let i = 0; i < socials.length; i++) {
          msg += "\n🔗 " + socials[i];
        }
      }

      msg += "\n━━━━━━━━━━━━━━━━━━━━";

      console.log("[DEX] New token: " + (token.description || token.tokenAddress));
      await sendTelegram(msg);
      await new Promise(function(r) { setTimeout(r, 1500); });
    }

    if (newCount > 0) {
      console.log("[DEX] Found " + newCount + " new tokens, tracking " + seenPairs.size + " total");
    }
  } catch (err) {
    console.log("[DEX] Scan error:", err.message);
  }
}

// ─── Reddit Scanner ───────────────────────────────────────────────────────────

const SUBREDDITS = [
  "CryptoMoonShots",
  "memecoin",
  "NewCryptoListings",
  "CryptoGemDiscovery",
  "ico"
];

const KEYWORDS = [
  "just launched", "new launch", "launching now", "launching today",
  "stealth launch", "fair launch", "presale", "pre-sale",
  "new token", "new coin", "new memecoin", "gem", "low cap",
  "100x", "contract address", "ca:", "pump", "dex", "listed", "listing"
];

function isRelevant(title, text) {
  const content = (title + " " + (text || "")).toLowerCase();
  return KEYWORDS.some(function(kw) { return content.includes(kw); });
}

const BROWSER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function scanReddit() {
  for (const sub of SUBREDDITS) {
    try {
      const res = await fetch(
        "https://www.reddit.com/r/" + sub + "/new.json?limit=15",
        { headers: { "User-Agent": BROWSER_AGENT } }
      );

      if (res.status === 429) { console.log("[REDDIT] Rate limited on r/" + sub); continue; }
      if (res.status === 403) { console.log("[REDDIT] r/" + sub + " restricted, skipping..."); continue; }
      if (!res.ok) { console.log("[REDDIT] Error on r/" + sub + ": HTTP " + res.status); continue; }

      const data = await res.json();
      if (!data.data || !data.data.children) continue;

      let newCount = 0;

      for (const post of data.data.children) {
        const p = post.data;
        if (seenPosts.has(p.id)) continue;
        seenPosts.add(p.id);
        if (!isRelevant(p.title, p.selftext)) continue;

        newCount++;

        let msg =
          "🔥 <b>New Launch Spotted</b>\n" +
          "━━━━━━━━━━━━━━━━━━━━\n" +
          "📌 <b>" + p.title + "</b>\n" +
          "━━━━━━━━━━━━━━━━━━━━\n" +
          "👤 Author: <b>u/" + p.author + "</b>\n" +
          "📂 Subreddit: <b>r/" + p.subreddit + "</b>\n" +
          "⬆️ Upvotes: <b>" + p.ups + "</b>\n" +
          "💬 Comments: <b>" + p.num_comments + "</b>\n" +
          "━━━━━━━━━━━━━━━━━━━━\n" +
          "🔗 <a href='https://reddit.com" + p.permalink + "'>View Post</a>";

        if (p.url && !p.url.includes("reddit.com")) {
          msg += " | <a href='" + p.url + "'>External Link</a>";
        }

        msg += "\n━━━━━━━━━━━━━━━━━━━━";

        console.log("[REDDIT] New relevant post: " + p.title);
        await sendTelegram(msg);
        await new Promise(function(r) { setTimeout(r, 1500); });
      }

      if (newCount > 0) {
        console.log("[REDDIT] r/" + sub + " — " + newCount + " relevant posts sent");
      }

      await new Promise(function(r) { setTimeout(r, 2000); });
    } catch (err) {
      console.log("[REDDIT] Scan error on r/" + sub + ":", err.message);
    }
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

console.log("Scanner started...");
console.log("Bot token set:", TELEGRAM_BOT_TOKEN ? "Yes" : "No");
console.log("Chat ID set:", TELEGRAM_CHAT_ID ? "Yes" : "No");

sendStartupMessage();
scanDex();
scanReddit();
pollUpdates();

setInterval(scanDex, 5000);
setInterval(scanReddit, 60000);
setInterval(sendHeartbeat, 30 * 60 * 1000);
