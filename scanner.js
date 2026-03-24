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
  } catch (err) {
    console.log("Telegram error:", err.message);
  }
}

async function scan() {
  try {
    const res = await fetch("https://api.dexscreener.com/latest/dex/tokens/SOL");
    const text = await res.text();
    
    if (text.startsWith("<!")) {
      console.log("API returned HTML, waiting...");
      return;
    }
    
    const data = JSON.parse(text);
    const pairs = data.pairs || [];
    
    for (const pair of pairs) {
      if (seenPairs.has(pair.pairAddress)) continue;
      seenPairs.add(pair.pairAddress);
      
      const liquidity = pair.liquidity ? pair.liquidity.usd : 0;
      const hasInfo = pair.info && pair.info.websites && pair.info.websites.length > 0;
      
      if (liquidity >= 1000) {
        let msg = "New Pair Detected\n";
        msg += "Name: " + (pair.baseToken ? pair.baseToken.name : "Unknown") + "\n";
        msg += "Symbol: " + (pair.baseToken ? pair.baseToken.symbol : "???") + "\n";
        msg += "Chain: " + (pair.chainId ? pair.chainId.toUpperCase() : "Unknown") + "\n";
        msg += "Liquidity: $" + (liquidity / 1000).toFixed(2) + "K\n";
        msg += "Price: $" + (pair.priceUsd || "0") + "\n";
        msg += "Contract: " + (pair.baseToken ? pair.baseToken.address : "N/A");
        msg += "\n\nDexscreener: https://dexscreener.com/" + pair.chainId + "/" + pair.pairAddress;
        
        console.log(msg);
        console.log("---");
        await sendTelegram(msg);
        await new Promise(function(r) { setTimeout(r, 1500); });
      }
    }
    console.log("Scanned " + pairs.length + " pairs, tracking " + seenPairs.size + " total");
  } catch (err) {
    console.log("Scan error:", err.message);
  }
}

console.log("Scanner started...");
console.log("Bot token set:", TELEGRAM_BOT_TOKEN ? "Yes" : "No");
console.log("Chat ID set:", TELEGRAM_CHAT_ID ? "Yes" : "No");
scan();
setInterval(scan, 5000);
