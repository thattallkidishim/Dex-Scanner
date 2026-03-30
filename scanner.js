const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const seenPairs = new Set();
const seenPosts = new Set();
const authorizedChats = new Set([TELEGRAM_CHAT_ID]);
let totalAlerts = 0;
let startTime = Date.now();

// ─── Nitter instances — auto rotates if one fails ─────────────────────────────

const NITTER_INSTANCES = [
  "https://nitter.poast.org",
  "https://nitter.privacydev.net",
  "https://nitter.net",
  "https://nitter.it",
  "https://nitter.nl",
  "https://tweet.lambda.dance"
];
let currentNitterIndex = 0;

function getNitterInstance() {
  return NITTER_INSTANCES[currentNitterIndex];
}

function rotateNitter() {
  currentNitterIndex = (currentNitterIndex + 1) % NITTER_INSTANCES.length;
  console.log("[NITTER] Switched to: " + getNitterInstance());
}

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

// ─── Pin a message ────────────────────────────────────────────────────────────

async function pinMessage(chatId, messageId) {
  try {
    const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/pinChatMessage";
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        disable_notification: true
      })
    });
    console.log("[BOT] Message pinned in chat " + chatId);
  } catch (err) {
    console.log("[BOT] Pin error:", err.message);
  }
}

// ─── Send and auto pin ────────────────────────────────────────────────────────

async function sendAndPin(chatId, message) {
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
    const data = await res.json();
    if (data.result && data.result.message_id) {
      await pinMessage(chatId, data.result.message_id);
    }
  } catch (err) {
    console.log("[BOT] sendAndPin error:", err.message);
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
    "✅ New Pairs — Active\n" +
    "✅ Reddit — Active\n" +
    "✅ X Monitor — Active\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "📋 <b>Commands:</b>\n" +
    "/start — Subscribe to alerts\n" +
    "/stop — Unsubscribe from alerts\n" +
    "/status — View bot stats\n" +
    "/help — List all commands\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "🟢 <b>All systems running</b>";

  for (const chatId of authorizedChats) {
    await sendAndPin(chatId, msg);
    totalAlerts++;
  }
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
    "📢 Posts tracked: <b>" + seenPosts.size + "</b>\n" +
    "📬 Total alerts sent: <b>" + totalAlerts + "</b>\n" +
    "👥 Active users: <b>" + authorizedChats.size + "</b>\n" +
    "🐦 Nitter instance: <b>" + getNitterInstance() + "</b>\n" +
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
    await sendAndPin(chatId,
      "👋 <b>Welcome " + firstName + "!</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "✅ You are now subscribed to alerts\n" +
      "📡 You will receive:\n" +
      "  • 🚨 New token launches from DexScreener\n" +
      "  • ⚡ New pairs under 30 mins old\n" +
      "  • 🔥 New launch posts from Reddit\n" +
      "  • 🐦 New X posts about launches\n" +
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
      "📢 Posts tracked: <b>" + seenPosts.size + "</b>\n" +
      "📬 Total alerts sent: <b>" + totalAlerts + "</b>\n" +
      "👥 Active users: <b>" + authorizedChats.size + "</b>\n" +
      "🐦 Nitter instance: <b>" + getNitterInstance() + "</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "🟢 <b>All systems running</b>"
    );
    return;
  }

  if (text === "/help") {
    await sendAndPin(chatId,
      "📋 <b>Available Commands</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "/start — Subscribe to all alerts\n" +
      "/stop — Unsubscribe from alerts\n" +
      "/status — View live bot stats\n" +
      "/help — Show this message\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "📡 <b>What we scan:</b>\n" +
      "• 🚨 DexScreener new token boosts\n" +
      "• ⚡ New pairs under 30 mins old\n" +
      "• 🔥 Reddit launch posts across 5 subs\n" +
      "• 🐦 X posts with launch keywords\n" +
      "• ⛓ Supports SOL, ETH, BSC, BASE & more\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "🛠 <b>Bot Info:</b>\n" +
      "• Version: 2.0.0\n" +
      "• DEX scan: Every 5s\n" +
      "• New pairs scan: Every 10s\n" +
      "• Reddit scan: Every 60s\n" +
      "• X scan: Every 45s\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "👨‍💻 <b>Developer:</b>\n" +
      "• Built & maintained by <b>@motionw404</b>\n" +
      "• For bug reports, feature requests or\n" +
      "  custom bot inquiries contact <b>@motionw404</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "⚠️ <b>Disclaimer:</b>\n" +
      "This bot is for informational purposes only.\n" +
      "Always DYOR before investing.\n" +
      "━━━━━━━━━━━━━━━━━━━━"
    );
    return;
  }

  await sendToChat(chatId,
    "❓ <b>Unknown Command</b>\n" +
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

// ─── DexScreener Token Boosts Scanner ────────────────────────────────────────

const BROWSER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function scanDex() {
  try {
    const res = await fetch("https://api.dexscreener.com/token-profiles/latest/v1");
    const text = await res.text();

    if (text.startsWith("<!") || text.startsWith("<")) {
      console.log("[DEX] API returned HTML, skipping...");
      return;
    }

    const data = JSON.parse(text);
    let newCount = 0;
    let skippedCount = 0;

    for (const token of data) {
      if (seenPairs.has(token.tokenAddress)) continue;
      seenPairs.add(token.tokenAddress);

      let pairData = null;
      try {
        const pairRes = await fetch(
          "https://api.dexscreener.com/latest/dex/tokens/" + token.tokenAddress
        );
        const pairText = await pairRes.text();
        if (!pairText.startsWith("<")) {
          const pairJson = JSON.parse(pairText);
          if (pairJson.pairs && pairJson.pairs.length > 0) {
            pairData = pairJson.pairs.sort(function(a, b) {
              return (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0);
            })[0];
          }
        }
      } catch (e) {}

      if (pairData) {
        const marketCap = pairData.marketCap || 0;
        const liquidityUsd = pairData.liquidity?.usd || 0;
        const txns24h = (pairData.txns?.h24?.buys || 0) + (pairData.txns?.h24?.sells || 0);
        const volume24h = pairData.volume?.h24 || 0;
        const ageMinutes = pairData.pairCreatedAt
          ? Math.floor((Date.now() - pairData.pairCreatedAt) / 1000 / 60)
          : 999999;

        if (marketCap > 500000)  { skippedCount++; continue; }
        if (liquidityUsd > 100000) { skippedCount++; continue; }
        if (txns24h > 2000)      { skippedCount++; continue; }
        if (volume24h > 500000)  { skippedCount++; continue; }
        if (ageMinutes > 1440)   { skippedCount++; continue; }
      }

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

      let ageStr = "Unknown";
      if (pairData && pairData.pairCreatedAt) {
        const mins = Math.floor((Date.now() - pairData.pairCreatedAt) / 1000 / 60);
        ageStr = mins < 60 ? mins + " minutes old" : Math.floor(mins / 60) + "h " + (mins % 60) + "m old";
      }

      let msg =
        "🚨 <b>Early Token Found</b>\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "📛 Name: <b>" + (token.description || "Unknown") + "</b>\n" +
        chainEmoji + " Chain: <b>" + chain + "</b>\n" +
        "⏱ Age: <b>" + ageStr + "</b>\n" +
        "💰 MCap: <b>" + (pairData?.marketCap ? "$" + Math.floor(pairData.marketCap).toLocaleString() : "Unknown") + "</b>\n" +
        "💧 Liquidity: <b>" + (pairData?.liquidity?.usd ? "$" + Math.floor(pairData.liquidity.usd).toLocaleString() : "Unknown") + "</b>\n" +
        "📋 Contract:\n<code>" + token.tokenAddress + "</code>\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "🔍 <a href='" + (token.url || "https://dexscreener.com") + "'>View on DexScreener</a>";

      if (socials.length > 0) {
        msg += "\n\n🌐 <b>Socials:</b>";
        for (let i = 0; i < socials.length; i++) msg += "\n🔗 " + socials[i];
      }

      msg += "\n━━━━━━━━━━━━━━━━━━━━";

      console.log("[DEX] Early token: " + (token.description || token.tokenAddress));
      await sendTelegram(msg);
      await new Promise(r => setTimeout(r, 1500));
    }

    if (newCount > 0 || skippedCount > 0) {
      console.log("[DEX] " + newCount + " sent, " + skippedCount + " skipped");
    }
  } catch (err) {
    console.log("[DEX] Scan error:", err.message);
  }
}

// ─── New Pairs Scanner ────────────────────────────────────────────────────────

async function scanNewPairs() {
  try {
    const chains = ["solana", "ethereum", "bsc", "base"];

    for (const chain of chains) {
      const res = await fetch(
        "https://api.dexscreener.com/latest/dex/search?q=new&chainId=" + chain,
        { headers: { "User-Agent": BROWSER_AGENT } }
      );

      const text = await res.text();
      if (text.startsWith("<")) continue;

      const data = JSON.parse(text);
      if (!data.pairs) continue;

      for (const pair of data.pairs) {
        if (!pair.pairCreatedAt) continue;
        if (seenPairs.has(pair.pairAddress)) continue;

        const ageMinutes = Math.floor((Date.now() - pair.pairCreatedAt) / 1000 / 60);
        if (ageMinutes > 30) continue;
        if ((pair.marketCap || 0) > 500000) continue;
        if ((pair.liquidity?.usd || 0) < 1000) continue;

        seenPairs.add(pair.pairAddress);

        const chainUp = (pair.chainId || "").toUpperCase();
        const chainEmoji =
          chainUp === "SOLANA" ? "🟣" :
          chainUp === "ETHEREUM" ? "🔷" :
          chainUp === "BSC" ? "🟡" :
          chainUp === "BASE" ? "🔵" : "🔗";

        const ageStr = ageMinutes < 60
          ? ageMinutes + " minutes old"
          : Math.floor(ageMinutes / 60) + "h " + (ageMinutes % 60) + "m old";

        const socials = [];
        if (pair.info?.socials) {
          for (const s of pair.info.socials) {
            if (s.url) socials.push(s.type + ": " + s.url);
          }
        }
        if (pair.info?.websites) {
          for (const w of pair.info.websites) {
            if (w.url) socials.push("🌐 " + w.url);
          }
        }

        let msg =
          "⚡ <b>New Pair Just Launched</b>\n" +
          "━━━━━━━━━━━━━━━━━━━━\n" +
          "📛 Name: <b>" + (pair.baseToken?.name || "Unknown") + "</b>\n" +
          "🔤 Symbol: <b>$" + (pair.baseToken?.symbol || "?") + "</b>\n" +
          chainEmoji + " Chain: <b>" + chainUp + "</b>\n" +
          "⏱ Age: <b>" + ageStr + "</b>\n" +
          "💰 MCap: <b>" + (pair.marketCap ? "$" + Math.floor(pair.marketCap).toLocaleString() : "Unknown") + "</b>\n" +
          "💧 Liquidity: <b>" + (pair.liquidity?.usd ? "$" + Math.floor(pair.liquidity.usd).toLocaleString() : "Unknown") + "</b>\n" +
          "🔄 Txns: <b>" + (pair.txns?.h1?.buys || 0) + "B / " + (pair.txns?.h1?.sells || 0) + "S (1h)</b>\n" +
          "📋 Contract:\n<code>" + (pair.baseToken?.address || "Unknown") + "</code>\n" +
          "━━━━━━━━━━━━━━━━━━━━\n" +
          "🔍 <a href='" + (pair.url || "https://dexscreener.com") + "'>View on DexScreener</a>";

        if (socials.length > 0) {
          msg += "\n\n🌐 <b>Socials:</b>";
          for (const s of socials) msg += "\n🔗 " + s;
        } else {
          msg += "\n\n⚠️ <b>No socials yet — very early</b>";
        }

        msg += "\n━━━━━━━━━━━━━━━━━━━━";

        console.log("[PAIRS] New pair: " + (pair.baseToken?.symbol || pair.pairAddress));
        await sendTelegram(msg);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  } catch (err) {
    console.log("[PAIRS] Scan error:", err.message);
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
          "🔥 <b>New Launch Spotted on Reddit</b>\n" +
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

        console.log("[REDDIT] Relevant post: " + p.title);
        await sendTelegram(msg);
        await new Promise(r => setTimeout(r, 1500));
      }

      if (newCount > 0) console.log("[REDDIT] r/" + sub + " — " + newCount + " posts sent");
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.log("[REDDIT] Scan error on r/" + sub + ":", err.message);
    }
  }
}

// ─── X / Nitter Scanner ───────────────────────────────────────────────────────

const X_KEYWORDS = [
  "stealth launch crypto",
  "fair launch token",
  "just launched solana",
  "new token launch",
  "CA: solana",
  "launching now crypto"
];

async function scanNitter() {
  for (const keyword of X_KEYWORDS) {
    try {
      const encoded = encodeURIComponent(keyword);
      const res = await fetch(
        getNitterInstance() + "/search/rss?q=" + encoded,
        {
          headers: { "User-Agent": BROWSER_AGENT },
          signal: AbortSignal.timeout(8000)
        }
      );

      if (!res.ok) {
        console.log("[NITTER] HTTP " + res.status + " on '" + keyword + "' — rotating instance");
        rotateNitter();
        continue;
      }

      const xml = await res.text();

      if (xml.startsWith("<") && xml.includes("<channel>")) {
        const items = xml.split("<item>");
        items.shift();

        for (const item of items) {
          const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
          const linkMatch = item.match(/<link>(.*?)<\/link>/);
          const authorMatch = item.match(/<dc:creator><!\[CDATA\[(.*?)\]\]><\/dc:creator>/);

          if (!titleMatch || !linkMatch) continue;

          const title = titleMatch[1];
          const link = linkMatch[1].replace(getNitterInstance(), "https://x.com");
          const author = authorMatch ? authorMatch[1] : "Unknown";

          if (seenPosts.has(link)) continue;
          seenPosts.add(link);

          let msg =
            "🐦 <b>New X Post — Launch Signal</b>\n" +
            "━━━━━━━━━━━━━━━━━━━━\n" +
            "👤 Author: <b>" + author + "</b>\n" +
            "🔑 Keyword: <b>" + keyword + "</b>\n" +
            "📝 <b>" + title + "</b>\n" +
            "━━━━━━━━━━━━━━━━━━━━\n" +
            "🔗 <a href='" + link + "'>View on X</a>\n" +
            "━━━━━━━━━━━━━━━━━━━━";

          console.log("[NITTER] New post: " + title);
          await sendTelegram(msg);
          await new Promise(r => setTimeout(r, 1500));
        }
      } else {
        console.log("[NITTER] Bad response — rotating instance");
        rotateNitter();
      }

      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.log("[NITTER] Error on '" + keyword + "': " + err.message + " — rotating instance");
      rotateNitter();
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

console.log("Scanner started...");
console.log("Bot token set:", TELEGRAM_BOT_TOKEN ? "Yes" : "No");
console.log("Chat ID set:", TELEGRAM_CHAT_ID ? "Yes" : "No");

sendStartupMessage();
scanDex();
scanNewPairs();
scanReddit();
scanNitter();
pollUpdates();

setInterval(scanDex, 5000);
setInterval(scanNewPairs, 10000);
setInterval(scanReddit, 60000);
setInterval(scanNitter, 45000);
setInterval(sendHeartbeat, 30 * 60 * 1000);
