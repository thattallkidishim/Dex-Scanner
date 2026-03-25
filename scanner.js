const https = require("https");
const http = require("http");

// =====================
// CONFIGURATION
// =====================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// Users and seen items
const approvedUsers = new Set();
const seenTokens = new Set();
const alertedTokens = new Set();

// Pre-loaded one-time codes (admin can generate random codes)
const validCodes = new Set();

// Add admin automatically
if (ADMIN_USER_ID) approvedUsers.add(String(ADMIN_USER_ID));

// =====================
// TELEGRAM FUNCTIONS
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
// FETCH WITH TIMEOUT
// =====================
function fetchUrl(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 15000,
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ data }));
    });

    req.on("error", () => resolve({ data: null }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ data: null });
    });
  });
}

// =====================
// TWITTER REGION
// =====================
async function getTwitterRegion(url) {
  try {
    const res = await fetchUrl(url);
    const html = res.data || "";
    let region = "Unknown";

    if (html.includes("Nigeria")) region = "Africa";
    else if (html.includes("USA")) region = "North America";
    else if (html.includes("UK")) region = "Europe";
    else if (html.includes("India")) region = "Asia";

    return region;
  } catch {
    return "Unknown";
  }
}

// =====================
// TELEGRAM COMMANDS
// =====================
async function handleStart(chatId, userId) {
  if (approvedUsers.has(String(userId))) {
    await sendMessage(chatId, "✅ You are already verified! You will receive all token alerts.");
  } else {
    await sendMessage(chatId,
      "Welcome!\n\nTo get access, request your code from @motionw404 on Telegram.\n\n" +
      "Then enter it here:\n/code YOURCODE\n\nExample: /code ABC123"
    );
  }
}

async function handleCode(chatId, userId, code) {
  const userIdStr = String(userId);
  if (approvedUsers.has(userIdStr)) {
    await sendMessage(chatId, "✅ You are already verified!");
    return;
  }

  if (!code) {
    await sendMessage(chatId, "Please enter a code.\n\nExample: /code ABC123");
    return;
  }

  const codeUpper = code.toUpperCase().trim();
  if (validCodes.has(codeUpper)) {
    validCodes.delete(codeUpper);
    approvedUsers.add(userIdStr);
    await sendMessage(chatId, "✅ Code accepted! You are now verified and will receive all token alerts.");
    console.log("New user verified:", userId);
  } else {
    await sendMessage(chatId, "❌ Invalid code. Please request a valid one from @motionw404.");
  }
}

// =====================
// ADMIN COMMANDS
// =====================
async function handleNewCode(chatId, userId) {
  if (String(userId) !== String(ADMIN_USER_ID)) return;
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let newCode = "";
  for (let i = 0; i < 6; i++) newCode += chars.charAt(Math.floor(Math.random() * chars.length));
  validCodes.add(newCode);
  await sendMessage(chatId, `✅ New code created:\n${newCode}\nWorks once. Share with user.`);
}

async function handleUsers(chatId, userId) {
  if (String(userId) !== String(ADMIN_USER_ID)) return;
  await sendMessage(chatId, `Verified users: ${approvedUsers.size}`);
}

async function handleCodes(chatId, userId) {
  if (String(userId) !== String(ADMIN_USER_ID)) return;
  const list = Array.from(validCodes).join("\n") || "No codes available";
  await sendMessage(chatId, `Available codes:\n${list}`);
}

// =====================
// PROCESS TELEGRAM UPDATES
// =====================
async function processUpdate(update) {
  if (!update.message || !update.message.text) return;
  const chatId = update.message.chat.id;
  const userId = update.message.from.id;
  const text = update.message.text.trim();

  if (text === "/start") await handleStart(chatId, userId);
  else if (text.startsWith("/code ")) await handleCode(chatId, userId, text.substring(6).trim());
  else if (text === "/code") await sendMessage(chatId, "Please enter your code.\n\nExample: /code ABC123");
  else if (text === "/newcode") await handleNewCode(chatId, userId);
  else if (text === "/users") await handleUsers(chatId, userId);
  else if (text === "/codes") await handleCodes(chatId, userId);
}

// =====================
// POLL TELEGRAM
// =====================
let lastUpdateId = 0;
async function pollMessages() {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
    const response = await new Promise((resolve, reject) => {
      const req = https.get(url, { timeout: 35000 }, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => resolve(data));
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    });
    const result = JSON.parse(response);
    if (result.ok && result.result) {
      for (const update of result.result) {
        lastUpdateId = update.update_id;
        await processUpdate(update);
      }
    }
  } catch (err) { console.log("Poll error:", err.message); }
  setTimeout(pollMessages, 1000);
}

// =====================
// DEX SCANNER (<50K MC, multi-chain, socials & region)
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
      if (alertedTokens.has(t.tokenAddress)) continue;

      const socials = [];
      if (t.links) for (const l of t.links) if (l.url && !l.url.includes("dexscreener")) socials.push(l.url);
      if (socials.length === 0) continue;

      let regionInfo = "";
      const twitter = socials.find(s => s.includes("x.com") || s.includes("twitter"));
      if (twitter) {
        const region = await getTwitterRegion(twitter);
        regionInfo = ` | Region: ${region}`;
      }

      const chains = t.chainId ? t.chainId.toUpperCase() : "Unknown";

      const msg = `🚀 NEW EARLY TOKEN DETECTED

Name: ${t.description || "Unknown"}
Chain: ${chains}
MC: $${mc}
Contract: ${t.tokenAddress}${regionInfo}

Socials:
${socials.join("\n")}`;

      await sendMessageToAll(msg);
      alertedTokens.add(t.tokenAddress);
    }
  } catch (err) { console.log("Dex scanner error:", err.message); }
}

async function sendMessageToAll(msg) {
  for (const user of approvedUsers) {
    try { await sendMessage(user, msg); await new Promise(r => setTimeout(r, 400)); }
    catch {}
  }
}

// =====================
// KEEP ALIVE
// =====================
http.createServer((req, res) => res.end("Dex Scanner Bot Running")).listen(process.env.PORT || 3000);

// =====================
// START BOT
// =====================
pollMessages();
setInterval(scanDex, 10000);
scanDex();
