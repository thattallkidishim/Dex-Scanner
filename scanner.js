const https = require("https");
const http = require("http");

// =====================
// CONFIGURATION
// =====================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// Dynamic one-time codes
const validCodes = new Set();

// Verified users
const approvedUsers = new Set();

// Add admin automatically
if (ADMIN_USER_ID) {
  approvedUsers.add(String(ADMIN_USER_ID));
}

// Track seen tokens
const seenTokens = new Set();

// =====================
// TELEGRAM FUNCTIONS
// =====================

function sendMessage(chatId, text) {
  return new Promise((resolve, reject) => {
    const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
    const postData = JSON.stringify({ chat_id: chatId, text: text });

    const req = https.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve(data));
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

// =====================
// COMMAND HANDLERS
// =====================

async function handleStart(chatId, userId) {
  if (approvedUsers.has(String(userId))) {
    await sendMessage(chatId, "✅ Verified. You will receive alerts.");
  } else {
    await sendMessage(chatId, "Request for code and command from @motionw404 on Telegram.");
  }
}

async function handleCode(chatId, userId, code) {
  const userIdStr = String(userId);

  if (approvedUsers.has(userIdStr)) {
    await sendMessage(chatId, "✅ Already verified.");
    return;
  }

  if (!code) {
    await sendMessage(chatId, "Use: /code YOURCODE");
    return;
  }

  const codeUpper = code.toUpperCase().trim();

  if (validCodes.has(codeUpper)) {
    validCodes.delete(codeUpper);
    approvedUsers.add(userIdStr);

    await sendMessage(chatId, "✅ Access granted.");
    console.log("Verified:", userId);
  } else {
    await sendMessage(chatId, "❌ Invalid code.");
  }
}

async function handleNewCode(chatId, userId) {
  if (String(userId) !== String(ADMIN_USER_ID)) {
    await sendMessage(chatId, "Admin only.");
    return;
  }

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let newCode = "";

  for (let i = 0; i < 8; i++) {
    newCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  validCodes.add(newCode);

  await sendMessage(chatId, "🔑 Code:\n" + newCode);
}

async function handleUsers(chatId, userId) {
  if (String(userId) !== String(ADMIN_USER_ID)) return;
  await sendMessage(chatId, "Users: " + approvedUsers.size);
}

// =====================
// PROCESS MESSAGES
// =====================

async function processUpdate(update) {
  try {
    if (!update.message || !update.message.text) return;

    const chatId = update.message.chat.id;
    const userId = update.message.from.id;
    const text = update.message.text.trim();

    if (text === "/start") {
      await handleStart(chatId, userId);
    } else if (text.startsWith("/code ")) {
      await handleCode(chatId, userId, text.substring(6));
    } else if (text === "/newcode") {
      await handleNewCode(chatId, userId);
    } else if (text === "/users") {
      await handleUsers(chatId, userId);
    }

  } catch (err) {
    console.log("Process error:", err.message);
  }
}

// =====================
// POLLING
// =====================

let lastUpdateId = 0;

async function pollMessages() {
  try {
    const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN +
      "/getUpdates?offset=" + (lastUpdateId + 1) + "&timeout=30";

    const response = await new Promise((resolve, reject) => {
      const req = https.get(url, { timeout: 35000 }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve(data));
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Timeout"));
      });
    });

    const result = JSON.parse(response);

    if (result.ok && result.result) {
      for (const update of result.result) {
        lastUpdateId = update.update_id;
        await processUpdate(update);
      }
    }

  } catch (err) {
    console.log("Poll error:", err.message);
  }

  setTimeout(pollMessages, 300);
}

// =====================
// ALERT SYSTEM
// =====================

async function sendAlertToAll(message) {
  for (const userId of approvedUsers) {
    try {
      await sendMessage(userId, message);
      await new Promise(r => setTimeout(r, 500));
    } catch {
      console.log("Failed:", userId);
    }
  }
}

// =====================
// DEXSCREENER SCANNER
// =====================

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ data }));
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

async function scanDexscreener() {
  try {
    const res = await fetchUrl("https://api.dexscreener.com/token-boosts/latest/v1");

    if (res.data.startsWith("<")) return;

    const data = JSON.parse(res.data);

    for (const token of data) {
      if (!token.tokenAddress || seenTokens.has(token.tokenAddress)) continue;
      seenTokens.add(token.tokenAddress);

      if (!token.description || token.description.length < 2) continue;

      const socials = [];
      if (token.links) {
        for (const l of token.links) {
          if (l.url) socials.push(l.url);
        }
      }

      if (socials.length < 1) continue;

      let msg = "🚀 New Launch\n\n";
      msg += "Name: " + token.description + "\n";
      msg += "Chain: " + (token.chainId || "Unknown").toUpperCase() + "\n";
      msg += "CA:\n" + token.tokenAddress + "\n\n";
      msg += "Chart:\n" + (token.url || "https://dexscreener.com") + "\n\n";
      msg += "Socials:\n" + socials.join("\n");

      console.log("New:", token.description);

      await sendAlertToAll(msg);
    }

  } catch (err) {
    console.log("Scan error:", err.message);
  }
}

// =====================
// SERVER
// =====================

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Running | Users: " + approvedUsers.size);
}).listen(process.env.PORT || 3000);

// =====================
// START
// =====================

console.log("Bot running...");

pollMessages();
setInterval(scanDexscreener, 5000);
scanDexscreener();
