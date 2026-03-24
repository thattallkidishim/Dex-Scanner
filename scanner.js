const https = require("https");
const http = require("http");

// =====================
// CONFIGURATION
// =====================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// Pre-loaded one-time codes (users enter these to get access)
const validCodes = new Set(["ALPHA1", "EARLY2", "VIP123", "MOON99", "GEM555"]);

// Verified users who will receive alerts
const approvedUsers = new Set();

// Add admin automatically
if (ADMIN_USER_ID) {
  approvedUsers.add(ADMIN_USER_ID);
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
    await sendMessage(chatId, "You are already verified! You will receive token alerts.");
  } else {
    await sendMessage(chatId, "Welcome!\n\nTo get access, enter your verification code:\n\nType: /code YOURCODE\n\nExample: /code ALPHA1");
  }
}

async function handleCode(chatId, userId, code) {
  const userIdStr = String(userId);
  
  if (approvedUsers.has(userIdStr)) {
    await sendMessage(chatId, "You are already verified!");
    return;
  }
  
  if (!code) {
    await sendMessage(chatId, "Please enter a code.\n\nExample: /code ALPHA1");
    return;
  }
  
  const codeUpper = code.toUpperCase().trim();
  
  if (validCodes.has(codeUpper)) {
    // Code is valid - add user and remove code
    validCodes.delete(codeUpper);
    approvedUsers.add(userIdStr);
    await sendMessage(chatId, "Code accepted!\n\nYou are now verified and will receive all token alerts.");
    console.log("New user verified: " + userId);
  } else {
    await sendMessage(chatId, "Invalid code. Please try again or contact admin for a valid code.");
  }
}

async function handleNewCode(chatId, userId) {
  if (String(userId) !== String(ADMIN_USER_ID)) {
    await sendMessage(chatId, "Admin only command.");
    return;
  }
  
  // Generate random code
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let newCode = "";
  for (let i = 0; i < 6; i++) {
    newCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  validCodes.add(newCode);
  await sendMessage(chatId, "New code created:\n\n" + newCode + "\n\nShare this with a user. It works once.");
}

async function handleUsers(chatId, userId) {
  if (String(userId) !== String(ADMIN_USER_ID)) {
    await sendMessage(chatId, "Admin only command.");
    return;
  }
  
  const count = approvedUsers.size;
  await sendMessage(chatId, "Verified users: " + count);
}

async function handleCodes(chatId, userId) {
  if (String(userId) !== String(ADMIN_USER_ID)) {
    await sendMessage(chatId, "Admin only command.");
    return;
  }
  
  if (validCodes.size === 0) {
    await sendMessage(chatId, "No codes available.\n\nUse /newcode to create one.");
  } else {
    const codeList = Array.from(validCodes).join("\n");
    await sendMessage(chatId, "Available codes:\n\n" + codeList);
  }
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
      const code = text.substring(6).trim();
      await handleCode(chatId, userId, code);
    } else if (text === "/code") {
      await sendMessage(chatId, "Please enter a code.\n\nExample: /code ALPHA1");
    } else if (text === "/newcode") {
      await handleNewCode(chatId, userId);
    } else if (text === "/users") {
      await handleUsers(chatId, userId);
    } else if (text === "/codes") {
      await handleCodes(chatId, userId);
    }
  } catch (err) {
    console.log("Process error:", err.message);
  }
}

// =====================
// POLL FOR MESSAGES
// =====================

let lastUpdateId = 0;

async function pollMessages() {
  try {
    const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/getUpdates?offset=" + (lastUpdateId + 1) + "&timeout=30";
    
    const response = await new Promise((resolve, reject) => {
      const req = https.get(url, { timeout: 35000 }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
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
  } catch (err) {
    console.log("Poll error:", err.message);
  }
  
  // Poll again
  setTimeout(pollMessages, 1000);
}

// =====================
// SEND ALERTS TO ALL VERIFIED USERS
// =====================

async function sendAlertToAll(message) {
  for (const userId of approvedUsers) {
    try {
      await sendMessage(userId, message);
      // Small delay between messages
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      console.log("Failed to send to " + userId);
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
      res.on("end", () => resolve({ status: res.statusCode, data: data }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

async function scanDexscreener() {
  try {
    const res = await fetchUrl("https://api.dexscreener.com/token-boosts/latest/v1");
    
    if (res.data.startsWith("<")) {
      console.log("API returned HTML, skipping...");
      return;
    }
    
    const data = JSON.parse(res.data);
    let newCount = 0;
    
    for (const token of data) {
      if (seenTokens.has(token.tokenAddress)) continue;
      seenTokens.add(token.tokenAddress);
      
      // Extract socials
      const socials = [];
      if (token.links) {
        for (let i = 0; i < token.links.length; i++) {
          if (token.links[i].url) socials.push(token.links[i].url);
        }
      }
      
      // Only alert if has socials
      if (socials.length === 0) continue;
      
      newCount++;
      
      // Build alert message
      let msg = "New Project Detected\n\n";
      msg += "Name: " + (token.description || "Unknown") + "\n";
      msg += "Chain: " + (token.chainId ? token.chainId.toUpperCase() : "Unknown") + "\n";
      msg += "Contract: " + token.tokenAddress + "\n\n";
      msg += "Dexscreener: " + (token.url || "https://dexscreener.com") + "\n\n";
      msg += "Socials:";
      for (let i = 0; i < socials.length; i++) {
        msg += "\n" + socials[i];
      }
      
      console.log("New token found:", token.description || token.tokenAddress);
      
      // Send to all verified users
      await sendAlertToAll(msg);
    }
    
    console.log("Scanned. New: " + newCount + " | Tracking: " + seenTokens.size + " | Users: " + approvedUsers.size);
    
  } catch (err) {
    console.log("Scan error:", err.message);
  }
}

// =====================
// KEEP ALIVE SERVER
// =====================

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Dex Scanner Bot Running | Users: " + approvedUsers.size);
}).listen(process.env.PORT || 3000);

// =====================
// START BOT
// =====================

console.log("Dex Scanner Bot starting...");
console.log("Bot token set:", TELEGRAM_BOT_TOKEN ? "Yes" : "No");
console.log("Admin ID set:", ADMIN_USER_ID ? "Yes" : "No");
console.log("Pre-loaded codes:", Array.from(validCodes).join(", "));

// Start polling for messages
pollMessages();

// Start scanning every 5 seconds
setInterval(scanDexscreener, 5000);
scanDexscreener();
