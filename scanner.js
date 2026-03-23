const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "YOUR_BOT_TOKEN_HERE";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "YOUR_CHAT_ID_HERE";
const LIQUIDITY_MINIMUM = 1000;
const POLL_INTERVAL_MS = 3000;

const seenPairs = new Set();

async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message })
  });
}

function formatAlert(token) {
  let msg = `New Project Detected\n`;
  msg += `Name: ${token.name}\n`;
  msg += `Chain: ${token.chain}\n`;
  msg += `Liquidity: $${(token.liquidity / 1000).toFixed(2)}K\n`;
  msg += `Contract: ${token.contract}\n\nSocials:`;
  token.socials.forEach(s => { msg += `\n${s}`; });
  return msg;
}

async function scan() {
  try {
    const res = await fetch("https://api.dexscreener.com/token-profiles/latest/v1");
    const data = await res.json();
    
    for (const token of data) {
      if (seenPairs.has(token.tokenAddress)) continue;
      seenPairs.add(token.tokenAddress);
      
      const socials = [];
      if (token.links) {
        token.links.forEach(link => {
          if (link.url) socials.push(link.url);
        });
      }
      
      const liquidity = token.liquidity?.usd || 0;
      
      if (socials.length > 0 && liquidity >= LIQUIDITY_MINIMUM) {
        const alert = formatAlert({
          name: token.name || "Unknown",
          chain: token.chainId?.toUpperCase() || "Unknown",
          liquidity: liquidity,
          contract: token.tokenAddress,
          socials: socials
        });
        console.log(alert);
        await sendTelegram(alert);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  } catch (err) {
    console.log("Error:", err.message);
  }
}

console.log("Scanner started...");
setInterval(scan, POLL_INTERVAL_MS);
scan();
