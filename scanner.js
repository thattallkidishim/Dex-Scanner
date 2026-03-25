const https = require("https");
const http = require("http");

// =====================
// CONFIG
// =====================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

const approvedUsers = new Set();
const seenTokens = new Set();

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
// FETCH (ANTI-BLOCK)
// =====================

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://pump.fun/",
          "Origin": "https://pump.fun"
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ data }));
      }
    );

    req.on("error", reject);
  });
}

// =====================
// X INTEL
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
    else if (html.includes("Dubai")) region = "Middle East";

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
      await new Promise((r) => setTimeout(r, 400));
    } catch {}
  }
}

// =====================
// DEX (<50K)
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
          if (l.url && !l.url.includes("dexscreener")) socials.push(l.url);
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
  } catch {}
}

// =====================
// 🔥 ULTRA EARLY PUMP
// =====================

async function scanPump() {
  try {
    const res = await fetchUrl("https://frontend-api.pump.fun/coins/latest");

    if (!res.data || res.data.includes("error code")) {
      console.log("Pump blocked");
      return;
    }

    const data = JSON.parse(res.data);

    for (const t of data) {
      if (!t.mint || seenTokens.has(t.mint)) continue;

      const mc = t.market_cap || 0;

      // 🔥 ULTRA EARLY FILTER
      if (mc === 0 || mc > 20000) continue;

      seenTokens.add(t.mint);

      const socials = [];

      if (t.twitter) socials.push(t.twitter);
      if (t.telegram) socials.push(t.telegram);

      // ULTRA EARLY = almost no socials
      if (socials.length === 0 || socials.length > 2) continue;

      let twitter = socials.find(s => s.includes("x.com") || s.includes("twitter"));

      let x = { score: 0, region: "Unknown", created: "Unknown" };
      if (twitter) x = await scoreTwitter(twitter);

      if (x.score > 2) continue;

      let msg = `🔥 ULTRA EARLY PUMP

MC: $${mc}
X: ${x.score} | ${x.created} | ${x.region}

${t.mint}
${socials.join("\n")}`;

      console.log("ULTRA EARLY:", t.name);

      await sendAlert(msg);

      await new Promise(r => setTimeout(r, 200));
    }
  } catch (err) {
    console.log("Pump error:", err.message);
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
  scanPump();
}, 9000);

scanDex();
scanPump();
