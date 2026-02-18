const fs = require('fs');

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

    // UNFORMATTED LIQ PRICE (Current Code)
    if (position.liqPrice) twitterMsg += `💀 Liq Price: ${position.liqPrice}\n`;

    twitterMsg += `📊 Entry: ${position.entryPrice}\n`;

    if (pnlTag) {
        const pnlStr = pnl >= 0 ? `+$${formatCurrency(pnl)}` : `-$${formatCurrency(Math.abs(pnl))}`;
        twitterMsg += `💰 PnL: ${pnlStr}\n`;
    }

    twitterMsg += `🔗 ${position.hypurrscanUrl}\n`;
    twitterMsg += `#${position.coin} #Whale #Hyperliquid`;

    return twitterMsg;
};

// Simulation Data
const position = {
    isRecurring: true,
    coin: 'BTC',
    direction: 'SHORT',
    positionUSD: 28180000,
    leverage: 40,
    distancePercent: 1.65,
    accountEquity: 823200,
    entryPrice: 68079.5,
    liqPrice: 69198.4198582894, // LONG Raw Value
    unrealizedPnl: 1900,
    hypurrscanUrl: 'https://hypurrscan.io/address/0xec32...ae82'
};

const tweet = generateTweet(position);
const urlRegex = /(https?:\/\/[^\s]+)/g;
// Replace URL with 23 chars (Twitter standard)
const tweetAdjusted = tweet.replace(urlRegex, 'x'.repeat(23));

const output = `
TWEET CONTENT:
${tweet}

LENGTH ANALYSIS:
Raw Length: ${tweet.length}
Twitter Adjusted Length (Approx): ${tweetAdjusted.length}
Limit: 280
Pass: ${tweetAdjusted.length <= 280 ? 'YES' : 'NO'}
`;

fs.writeFileSync('tweet_analysis.txt', output);
console.log('Analysis saved to tweet_analysis.txt');
