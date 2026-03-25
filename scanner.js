const https = require("https");
const http = require("http");

// =====================
// CONFIG
// =====================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// 👉 ADD YOUR TARGET KEYWORDS (edit anytime)
const X_KEYWORDS = [
  "launching soon",
  "fair launch",
  "stealth launch",
  "token launch",
  "memecoin",
  "just launched",
  "new coin",
  "CA:",
  "contract address"
];

const approvedUsers = new Set();
const seenTokens = new Set();
const seenTweets = new Set();

if (ADMIN_USER_ID) {
  approvedUsers.add(String(ADMIN_USER_ID));
}

// =====================
// TELEGRAM
// =====================

function sendMessage(chatId, text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ chat_id: chatId, text });

    const req = https.request(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", resolve);
      }
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// =====================
// FETCH (SAFE)
// =====================

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    }, (res) => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => resolve({ data }));
    }).on("error", reject);
  });
}

// =====================
// X INTELLIGENCE
// =====================

async function scoreTwitter(url) {
  try {
    const res = await fetchUrl(url);
    const html = res.data;

    let score = 0;

    if (html.includes("followers")) score++;
    if (html.includes("verified")) score += 2;

    let created = "Unknown";

    const match = html.match(/Joined\s([A-Za-z]+\s\d{4})/);
    if (match) {
      created = match[1];

      const year = parseInt(created.split(" ")[1]);
      const now = new Date().getFullYear();

      if (now - year <= 1) score -= 1;
      if (now - year >= 3) score += 1;
    }

    let region = "Unknown";

    if (html.includes("Nigeria")) region = "Africa";
    else if (html.includes("USA")) region = "North America";
    else if (html.includes("UK")) region = "Europe";
    else if (html.includes("India")) region = "Asia";

    return { score, region, created };

  } catch {
    return { score: 0, region: "Unknown", created: "Unknown" };
  }
}

// =====================
// ALERT
// =====================

async function sendAlert(msg) {
  for (const user of approvedUsers) {
    try {
      await sendMessage(user, msg);
      await new Promise(r => setTimeout(r, 400));
    } catch {}
  }
}

// =====================
// DEX SCANNER (<50K)
// =====================

async function scanDex() {
  try {
    const res = await fetchUrl("https://api.dexscreener.com/token-boosts/latest/v1");

    if (!res.data || res.data.startsWith("<")) return;

    const data = JSON.parse(res.data);

    for (const t of data) {
      if (!t.tokenAddress || seenTokens.has(t.tokenAddress)) continue;

      const mc = t.fdv || 0;
      if (mc === 0 || mc > 50000) continue;

      seenTokens.add(t.tokenAddress);

      const socials = [];

      if (t.links) {
        for (const l of t.links) {
          if (l.url && !l.url.includes("dexscreener")) {
            socials.push(l.url);
          }
        }
      }

      if (socials.length === 0 || socials.length > 3) continue;

      let twitter = socials.find(s => s.includes("x.com") || s.includes("twitter"));

      let x = { score: 0, region: "Unknown", created: "Unknown" };
      if (twitter) x = await scoreTwitter(twitter);

      if (x.score > 3) continue;

      let msg = `🚀 Dex Early

MC: $${mc}
X: ${x.score} | ${x.created} | ${x.region}

${t.tokenAddress}
${socials.join("\n")}`;

      await sendAlert(msg);
    }

  } catch (err) {
    console.log("Dex error:", err.message);
  }
}

// =====================
// 🔥 X SPOTTER (NEW)
// =====================

async function scanX() {
  try {
    const res = await fetchUrl("https://nitter.net/search?f=tweets&q=launch");

    if (!res.data) return;

    const html = res.data;

    const tweets = html.split("timeline-item");

    for (const t of tweets) {
      const textMatch = t.match(/tweet-content[^>]*>(.*?)<\/div>/);
      const linkMatch = t.match(/href="\/([^"]+)\/status\/(\d+)"/);

      if (!textMatch || !linkMatch) continue;

      const text = textMatch[1].toLowerCase();

      // keyword filter
      if (!X_KEYWORDS.some(k => text.includes(k))) continue;

      const username = linkMatch[1];
      const tweetId = linkMatch[2];

      const tweetKey = username + tweetId;
      if (seenTweets.has(tweetKey)) continue;

      seenTweets.add(tweetKey);

      const profileUrl = `https://x.com/${username}`;

      const x = await scoreTwitter(profileUrl);

      if (x.score > 3) continue;

      let msg = `🐦 X EARLY SIGNAL

User: https://x.com/${username}

X Score: ${x.score}
Created: ${x.created}
Region: ${x.region}

Tweet:
${text.replace(/<[^>]+>/g, "")}`;

      await sendAlert(msg);

      await new Promise(r => setTimeout(r, 500));
    }

  } catch (err) {
    console.log("X scan error:", err.message);
  }
}

// =====================
// SERVER
// =====================

http.createServer((req, res) => {
  res.end("Running");
}).listen(process.env.PORT || 3000);

// =====================
// START
// =====================

setInterval(() => {
  scanDex();
  scanX();
}, 10000);

scanDex();
scanX();
