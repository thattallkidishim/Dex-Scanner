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
// SAFE FETCH (ANTI-BLOCK)
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
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

// =====================
// X SCORING + CREATED DATE
// =====================

async function scoreTwitter(url) {
  try {
    const res = await fetchUrl(url);
    const html = res.data;

    let score = 0;

    if (html.includes("followers")) score++;
    if (html.includes("verified")) score += 2;

    // ===== CREATED DATE =====
    let created = "Unknown";

    const match = html.match(/Joined\s([A-Za-z]+\s\d{4})/);
    if (match) {
      created = match[1];

      const year = parseInt(created.split(" ")[1]);
      const now = new Date().getFullYear();

      if (now - year <= 1) score -= 1; // newer = better
      if (now - year >= 3) score += 1;
    }

    // ===== REGION =====
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
// ALERT SYSTEM
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
// DEXSCREENER SCANNER (<50K)
// =====================

async function scanDex() {
  try {
    const res = await fetchUrl("https://api.dexscreener.com/token-boosts/latest/v1");

    if (!res.data || res.data.startsWith("<")) return;

    const data = JSON.parse(res.data);

    for (const t of data) {
      if (!t.tokenAddress || seenTokens.has(t.tokenAddress)) continue;

      const mc = t.fdv || 0;

      // 🔥 HARD FILTER
      if (mc === 0 || mc > 50000) continue;

      seenTokens.add(t.tokenAddress);

      if (!t.description) continue;

      const socials = [];

      if (t.links) {
        for (const l of t.links) {
          if (l.url && !l.url.includes("dexscreener")) {
            socials.push(l.url);
          }
        }
      }

      if (socials.length === 0 || socials.length > 3) continue;

      let twitter = socials.find(
        (s) => s.includes("x.com") || s.includes("twitter")
      );

      let x = { score: 0, region: "Unknown", created: "Unknown" };

      if (twitter) {
        x = await scoreTwitter(twitter);
      }

      if (x.score > 3) continue;

      let msg = `🚀 Dex Early (<50K MC)

Name: ${t.description}
Chain: ${t.chainId}

CA:
${t.tokenAddress}

MC: $${mc}

X Score: ${x.score}
X Created: ${x.created}
Region: ${x.region}

${socials.join("\n")}`;

      await sendAlert(msg);
    }
  } catch (err) {
    console.log("Dex error:", err.message);
  }
}

// =====================
// PUMPFUN SCANNER (BEST VERSION)
// =====================

async function scanPump() {
  try {
    const endpoints = [
      "https://frontend-api.pump.fun/coins/latest",
      "https://frontend-api.pump.fun/coins/trending"
    ];

    for (const url of endpoints) {
      const res = await fetchUrl(url);

      if (!res.data || res.data.startsWith("<") || res.data.includes("error code")) {
        console.log("Pump blocked:", url);
        continue;
      }

      let data;
      try {
        data = JSON.parse(res.data);
      } catch {
        continue;
      }

      for (const t of data) {
        if (!t.mint || seenTokens.has(t.mint)) continue;

        const mc = t.market_cap || 0;

        // 🔥 HARD FILTER
        if (mc === 0 || mc > 50000) continue;

        seenTokens.add(t.mint);

        if (!t.name) continue;

        const socials = [];

        if (t.twitter) socials.push(t.twitter);
        if (t.telegram) socials.push(t.telegram);
        if (t.website) socials.push(t.website);

        if (socials.length === 0 && t.description) {
          const matches = t.description.match(/https?:\/\/[^\s]+/g);
          if (matches) socials.push(...matches);
        }

        if (socials.length === 0 || socials.length > 3) continue;

        let twitter = socials.find(
          (s) => s.includes("x.com") || s.includes("twitter")
        );

        let x = { score: 0, region: "Unknown", created: "Unknown" };

        if (twitter) {
          x = await scoreTwitter(twitter);
        }

        if (x.score > 3) continue;

        let msg = `🚀 Pump Early (<50K MC)

Name: ${t.name}

CA:
${t.mint}

MC: $${mc}

X Score: ${x.score}
X Created: ${x.created}
Region: ${x.region}

${socials.join("\n")}`;

        console.log("Pump hit:", t.name);

        await sendAlert(msg);

        await new Promise((r) => setTimeout(r, 200));
      }
    }
  } catch (err) {
    console.log("Pump fatal:", err.message);
  }
}

// =====================
// SERVER (KEEP ALIVE)
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
}, 7000);

scanDex();
scanPump();
