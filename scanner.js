const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const seenPairs = new Set();

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

async function scan() {
  try {
    const res = await fetch("https://api.dexscreener.com/token-boosts/latest/v1");
    const text = await res.text();
    
    if (text.startsWith("<!") || text.startsWith("<")) {
      console.log("API returned HTML, skipping...");
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
      
      let msg = "New Token Detected\n";
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
    
    console.log("Found " + newCount + " new tokens, tracking " + seenPairs.size + " total");
  } catch (err) {
    console.log("Scan error:", err.message);
  }
}

console.log("Scanner started...");
console.log("Bot token set:", TELEGRAM_BOT_TOKEN ? "Yes" : "No");
console.log("Chat ID set:", TELEGRAM_CHAT_ID ? "Yes" : "No");
scan();
setInterval(scan, 5000);
