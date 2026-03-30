const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const seenPairs = new Set();
const seenPosts = new Set();

async function sendTelegram(message) {
  try {
    const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message })
    });
    console.log("Alert sent to Telegram");
  } catch (err) {
    console.log("Telegram error:", err.message);
  }
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

      let msg = "🚨 New Token Detected\n";
      msg += "Name: " + (token.description || "Unknown") + "\n";
      msg += "Chain: " + (token.chainId ? token.chainId.toUpperCase() : "Unknown") + "\n";
      msg += "Contract: " + token.tokenAddress;
      msg += "\n\nDexscreener: " + (token.url || "https://dexscreener.com");

      if (socials.length > 0) {
        msg += "\n\nSocials:";
        for (let i = 0; i < socials.length; i++) {
          msg += "\n" + socials[i];
        }
      }

      console.log(msg);
      console.log("---");
      await sendTelegram(msg);
      await new Promise(function(r) { setTimeout(r, 1500); });
    }

    console.log("[DEX] Found " + newCount + " new tokens, tracking " + seenPairs.size + " total");
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

// Only posts containing at least one of these keywords will be sent
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

        // Skip if no relevant keywords found
        if (!isRelevant(p.title, p.selftext)) {
          console.log("[REDDIT] Skipped (not relevant): " + p.title);
          continue;
        }

        newCount++;

        let msg = "🔥 New Launch Spotted on Reddit\n";
        msg += "Sub: r/" + p.subreddit + "\n";
        msg += "Title: " + p.title + "\n";
        msg += "Author: u/" + p.author + "\n";
        msg += "Link: https://reddit.com" + p.permalink;

        if (p.url && !p.url.includes("reddit.com")) {
          msg += "\nURL: " + p.url;
        }

        console.log(msg);
        console.log("---");
        await sendTelegram(msg);
        await new Promise(function(r) { setTimeout(r, 1500); });
      }

      console.log("[REDDIT] r/" + sub + " — " + newCount + " relevant posts");
      await new Promise(function(r) { setTimeout(r, 2000); });

    } catch (err) {
      console.log("[REDDIT] Scan error on r/" + sub + ":", err.message);
    }
  }
}

console.log("Scanner started...");
console.log("Bot token set:", TELEGRAM_BOT_TOKEN ? "Yes" : "No");
console.log("Chat ID set:", TELEGRAM_CHAT_ID ? "Yes" : "No");

scanDex();
scanReddit();

setInterval(scanDex, 5000);
setInterval(scanReddit, 60000);
