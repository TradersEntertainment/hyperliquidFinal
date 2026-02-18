const formatCurrency = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toFixed(2)}`;
};

const generateTweet = (position) => {
    const sizeStr = formatCurrency(position.positionUSD);
    const emoji = position.direction === 'LONG' ? '🟢' : '🔴';

    // PnL Logic
    const pnl = position.unrealizedPnl || 0;
    const pnlTag = pnl < -100000 ? '📉 BAG HOLDER' : (pnl > 100000 ? '📈 SMART WHALE' : '');

    // Custom Compact Message for Danger/Risk
    let tTitle = `📡 JUST CAUGHT ON RADAR 📡`;

    // Compact Header for Twitter
    let tHeader = `${emoji} ${sizeStr} #${position.coin} ${position.direction} (${position.distancePercent}% to Liq)`;

    if (position.isRecurring) {
        // Combined Format for Recurring: 📉 RISK INCREASING FOR: $67M BTC LONG 🟢 (1% to Liq) 💀💀
        tTitle = ''; // Clear separate title

        // Dynamic Skulls
        let skulls = '💀';
        if (position.positionUSD >= 30000000) skulls = '💀💀💀💀💀';
        else if (position.positionUSD >= 10000000) skulls = '💀💀';

        tHeader = `📉 RISK INCREASING FOR: ${sizeStr} #${position.coin} ${position.direction} ${emoji} (${position.distancePercent}% to Liq) ${skulls}`;
    }

    let twitterMsg = `${tHeader}\n`;
    if (tTitle) twitterMsg += `${tTitle}\n`;

    twitterMsg += `💎 Size: ${sizeStr} | ⚡ x${position.leverage}\n`;
    twitterMsg += `💵 Equity: ${formatCurrency(position.accountEquity)}\n`;

    if (position.liqPrice) twitterMsg += `💀 Liq Price: ${position.liqPrice}\n`;
    twitterMsg += `📊 Entry: ${position.entryPrice}\n`;

    // Add PnL if significant
    if (pnlTag) {
        const pnlStr = pnl >= 0 ? `+$${formatCurrency(pnl)}` : `-$${formatCurrency(Math.abs(pnl))}`;
        twitterMsg += `💰 PnL: ${pnlStr}\n`;
    }

    twitterMsg += `🔗 ${position.hypurrscanUrl}\n`;
    twitterMsg += `#${position.coin} #Whale #Hyperliquid`;

    return twitterMsg;
};

// Simulation Data based on user report
const position = {
    isRecurring: true,
    coin: 'BTC',
    direction: 'SHORT',
    positionUSD: 28180000, // $28.18M
    leverage: 40,
    distancePercent: 1.65,
    accountEquity: 823200, // $823.2K
    entryPrice: 68079.5,
    liqPrice: 69198.4198582894,
    unrealizedPnl: 1900,
    hypurrscanUrl: 'https://hypurrscan.io/address/0xec32...ae82' // Example URL
};

const tweet = generateTweet(position);
const length = tweet.length; // Note: Twitter counts emojis as 2 chars usually, but raw length is good first check. 
// Actually Twitter counts most emojis as 2, links as 23 chains.
// We should approximate check.

console.log("--- Generated Tweet ---");
console.log(tweet);
console.log("-----------------------");
console.log(`Length: ${length} characters`);

// Twitter specific calculation (Approx)
// URL = 23 chars always
// Emojis = 2 chars
const urlRegex = /(https?:\/\/[^\s]+)/g;
const tweetWithoutUrl = tweet.replace(urlRegex, 'XXXXXXXXXXXXXXXXXXXXXXX'); // 23 chars
console.log(`Twitter Adjusted Length (Approx): ${tweetWithoutUrl.length}`);
