const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const seenPairs = new Set();
const seenPosts = new Set();
let totalAlerts = 0;
let startTime = Date.now();

async function sendTelegram(message, options = {}) {
  try {
    const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: options.preview === true ? false : true
      })
    });
    totalAlerts++;
  } catch (err) {
    console.log("Telegram error:", err.message);
  }
}

async function sendStartupMessage() {
  const msg =
    "🤖 <b>Scanner Bot Online</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "✅ DexScreener — Active\n" +
    "✅ Reddit — Active\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "⏱ Scanning every <b>5s</b> for new tokens\n" +
    "📡 Monitoring <b>5 subreddits</b> for launches\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "🟢 <b>All systems running</b>";
  await sendTelegram(msg);
}

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
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "🟢 <b>Bot is running fine</b>";
  await sendTelegram(msg);
}

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
      await sendTelegram(msg, { preview: false });
      await new Promise(function(r) { setTimeout(r, 1500); });
    }

    if (newCount > 0) {
      console.log("[DEX] Found " + newCount + " new tokens, tracking " + seenPairs.size + " total");
    }
  } catch (err) {
    console.log("[DEX] Scan error:", err.message);
  }
}

const SUBREDDITS = [
  "CryptoMoonShots",
  "memecoin",
  "NewCryptoListings",
  "CryptoGemDiscovery",
  "ico"
];

const KEYWORDS = [
  "just launched",
  "new launch",
  "launching now",
  "launching today",
  "stealth launch",
  "fair launch",
  "presale",
  "pre-sale",
  "new token",
  "new coin",
  "new memecoin",
  "gem",
  "low cap",
  "100x",
  "contract address",
  "ca:",
  "pump",
  "dex",
  "listed",
  "listing"
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

      if (res.status === 429) {
        console.log("[REDDIT] Rate limited on r/" + sub + ", skipping...");
        continue;
      }

      if (res.status === 403) {
        console.log("[REDDIT] r/" + sub + " is restricted, skipping...");
        continue;
      }

      if (!res.ok) {
        console.log("[REDDIT] Error on r/" + sub + ": HTTP " + res.status);
        continue;
      }

      const data = await res.json();
      if (!data.data || !data.data.children) continue;

      let newCount = 0;

      for (const post of data.data.children) {
        const p = post.data;

        if (seenPosts.has(p.id)) continue;
        seenPosts.add(p.id);

        if (!isRelevant(p.title, p.selftext)) {
          console.log("[REDDIT] Skipped (not relevant): " + p.title);
          continue;
        }

        newCount++;

        const postUrl = "https://reddit.com" + p.permalink;

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
          "🔗 <a href='" + postUrl + "'>View Post on Reddit</a>";

        if (p.url && !p.url.includes("reddit.com")) {
          msg += "\n🌐 <a href='" + p.url + "'>External Link</a>";
        }

        msg += "\n━━━━━━━━━━━━━━━━━━━━";

        console.log("[REDDIT] New relevant post: " + p.title);
        await sendTelegram(msg, { preview: false });
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

console.log("Scanner started...");
console.log("Bot token set:", TELEGRAM_BOT_TOKEN ? "Yes" : "No");
console.log("Chat ID set:", TELEGRAM_CHAT_ID ? "Yes" : "No");

sendStartupMessage();
scanDex();
scanReddit();

setInterval(scanDex, 5000);
setInterval(scanReddit, 60000);

// Heartbeat status report every 30 minutes
setInterval(sendHeartbeat, 30 * 60 * 1000);
