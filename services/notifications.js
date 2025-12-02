const TelegramBot = require('node-telegram-bot-api');
const { TwitterApi } = require('twitter-api-v2');
const config = require('../config');
const state = require('../state');

// Initialize Telegram
let bot = null;
if (config.TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: false });
}

// Initialize Twitter
let twitterClient = null;
if (config.TWITTER_API_KEY && config.TWITTER_API_SECRET && config.TWITTER_ACCESS_TOKEN && config.TWITTER_ACCESS_SECRET) {
    twitterClient = new TwitterApi({
        appKey: config.TWITTER_API_KEY,
        appSecret: config.TWITTER_API_SECRET,
        accessToken: config.TWITTER_ACCESS_TOKEN,
        accessSecret: config.TWITTER_ACCESS_SECRET,
    });
}

const formatCurrency = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toFixed(2)}`;
};

const sendTelegramMessage = async (message) => {
    if (!bot || !config.TELEGRAM_CHANNEL_ID) return;
    try {
        await bot.sendMessage(config.TELEGRAM_CHANNEL_ID, message, { parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (error) {
        console.error('Telegram Error:', error.message);
    }
};

const twitterQueue = [];
let isProcessingQueue = false;

const processTwitterQueue = async () => {
    if (isProcessingQueue || twitterQueue.length === 0) return;
    isProcessingQueue = true;

    const text = twitterQueue.shift();
    try {
        if (twitterClient) {
            await twitterClient.v2.tweet(text);
            console.log('🐦 Tweet sent!');
        }
    } catch (error) {
        console.error('Twitter Error:', error.code || error.message);
        if (error.data) console.error('Twitter Error Data:', JSON.stringify(error.data, null, 2));

        // If Rate Limit (429), pause for 15 mins
        if (error.code === 429 || error.status === 429) {
            console.log('⏳ Twitter Rate Limit hit. Pausing queue for 15 mins...');
            twitterQueue.unshift(text); // Put back
            setTimeout(() => {
                isProcessingQueue = false;
                processTwitterQueue();
            }, 15 * 60 * 1000);
            return;
        }
    }

    // Wait 2 minutes before next tweet to be safe
    setTimeout(() => {
        isProcessingQueue = false;
        processTwitterQueue();
    }, 120000);
};

const sendTwitterTweet = async (text) => {
    if (!twitterClient) return;
    twitterQueue.push(text);
    processTwitterQueue();
};

// --- Helper Functions for Formatting ---

const formatTelegramMessage = (baseMsg, position) => {
    // Append Coin Hashtag to Telegram message
    return `${baseMsg}\n#${position.coin}`;
};

const formatTwitterMessage = (baseMsg, position) => {
    // 1. Strip HTML
    let twitterMsg = baseMsg.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');

    // 2. Replace "View on Hypurrscan" with the actual Link
    twitterMsg = twitterMsg.replace('View on Hypurrscan', position.hypurrscanUrl);

    // 3. Add "Hyperliquid." text
    twitterMsg += `\nHyperliquid.`;

    // 4. Add Hashtags
    twitterMsg += `\n#${position.coin} #Whale #Hyperliquid`;

    // 5. (Link already added above)

    // 6. Add Time (to prevent duplicate tweet errors)
    twitterMsg += `\n🕒 ${new Date().toLocaleTimeString()}`;

    return twitterMsg;
};

// ---------------------------------------

const sendDangerAlert = async (position) => {
    // Alert logic moved to tracker.js to prevent race conditions
    // This function now just formats and sends

    const emoji = position.direction === 'LONG' ? '🟢' : '🔴';

    let title = `⚠️ <b>${position.coin} ${position.direction}</b> 💀`;
    if (position.isRecurring) {
        const sizeStr = formatCurrency(position.positionUSD);
        title = `📉 <b>RISK INCREASING FOR ${sizeStr} ${position.coin} ${position.direction}</b> (${position.distancePercent}% to liq) 💀`;
    }

    // PnL Analysis
    const pnl = position.unrealizedPnl || 0;
    const pnlEmoji = pnl >= 0 ? '🤑' : '🩸';
    const pnlTag = pnl < -100000 ? '📉 <b>BAG HOLDER</b>' : (pnl > 100000 ? '📈 <b>SMART WHALE</b>' : '');

    const msg = `
${title}
━━━━━━━━━━━━━━━━
👑 <b>Whale</b>: <code>${position.userShort}</code>
💎 <b>Size</b>: ${formatCurrency(position.positionUSD)}
⚡ <b>Leverage</b>: ${position.leverage}x
💰 <b>uPnL</b>: ${pnlEmoji} ${formatCurrency(pnl)} ${pnlTag}
🏦 <b>Equity</b>: ${formatCurrency(position.accountEquity)}
📊 <b>Entry</b>: ${position.entryPrice}
💀 <b>Liquidation</b>: ${position.liqPrice || 'N/A'}
🎯 <b>Distance to Liq</b>: ${position.distancePercent}%
🔗 <a href="${position.hypurrscanUrl}">View on Hypurrscan</a>
    `.trim();

    // Telegram
    await sendTelegramMessage(formatTelegramMessage(msg, position));

    // Twitter
    // Only Tweet if VERY urgent (< 10% distance) or Significant PnL (Bag Holder/Smart Whale)
    if (position.distancePercent < 10 || pnlTag) {
        const twitterMsg = formatTwitterMessage(msg, position);
        await sendTwitterTweet(twitterMsg);
    }

    state.sentNotifications.unshift({
        type: 'DANGER',
        message: msg,
        timestamp: Date.now()
    });
    if (state.sentNotifications.length > 50) state.sentNotifications.pop();
};

const sendNewPositionAlert = async (position) => {
    const alertKey = `NEW-${position.user}-${position.coin}`;

    const emoji = position.direction === 'LONG' ? '🟢' : '🔴';

    let title = `🐋 <b>WHALE OPENED ${position.coin} ${position.direction}</b> 🐋`;

    // Dynamic Risk Threshold
    // BTC/ETH/SOL/BNB are stable, so 20% is safe. We want <10% for them to be "High Risk".
    // Altcoins are volatile, so 20% is already risky.
    const isMajor = ['BTC', 'ETH', 'SOL', 'BNB'].includes(position.coin);
    const riskThreshold = isMajor ? 10 : 20;

    if (position.isHypervaultAttack) {
        title = '🚨 <b>⚠️ MIGHT BE HLP ATTACK CRIME ⚠️</b> 🚨';
    } else if (position.distancePercent && position.distancePercent < riskThreshold) {
        title = `🔥 <b>HIGH RISK WHALE ENTRY</b> 🔥`;
    }

    const walletAge = position.walletAgeDays !== undefined ? `${position.walletAgeDays} days` : 'Unknown';
    const freshTag = position.isFreshWallet ? ' (Fresh 🥬)' : '';

    // Note: Removed hashtags from base msg to avoid duplication in Telegram helper
    const msg = `
${title}
${emoji} <b>${position.coin} ${position.direction}</b> ${emoji}
━━━━━━━━━━━━━━━━
👑 <b>Whale</b>: <code>${position.userShort}</code>
📅 <b>Age</b>: ${walletAge}${freshTag}
💎 <b>Size</b>: ${formatCurrency(position.positionUSD)}
⚡ <b>Leverage</b>: ${position.leverage}x
🏦 <b>Equity</b>: ${formatCurrency(position.accountEquity)}
📊 <b>Entry</b>: ${position.entryPrice}
🎯 <b>Distance to Liq</b>: ${position.distancePercent}%
🔗 <a href="${position.hypurrscanUrl}">View on Hypurrscan</a>
    `.trim();

    // Telegram
    await sendTelegramMessage(formatTelegramMessage(msg, position));

    // Twitter
    try {
        // Only Tweet if CRITICAL (Hypervault or High Risk) to avoid 429 Rate Limits
        if (position.isHypervaultAttack || (title && title.includes('HIGH RISK'))) {
            const twitterMsg = formatTwitterMessage(msg, position);
            await sendTwitterTweet(twitterMsg);
        }
    } catch (error) {
        console.error('Twitter Error Details:', error.response ? error.response.data : error.message);
    }

    state.sentNotifications.unshift({
        type: 'NEW',
        message: msg,
        timestamp: Date.now()
    });
    if (state.sentNotifications.length > 50) state.sentNotifications.pop();
};

const sendInsiderAlert = async (position, profitPercent, isTakingProfit = false) => {
    const emoji = position.direction === 'LONG' ? '🟢' : '🔴';
    const action = position.direction === 'LONG' ? 'LONGED' : 'SHORTED';
    const dumpPump = position.direction === 'LONG' ? 'PUMP' : 'DUMP';

    let title = '🚨 <b>POSSIBLE INSIDER DETECTED</b> 🚨';
    let desc = `⚠️ This wallet might be insider <b>${action}</b> just before ${dumpPump}.`;

    if (isTakingProfit) {
        const fromDir = position.direction === 'LONG' ? 'LONGS' : 'SHORTS';
        title = `💰 <b>INSIDER TAKING PROFIT FROM ${fromDir}</b> 💰`;
        desc = `⚠️ This insider is <b>REALIZING PROFITS</b> (Closing Position).`;
    }

    const msg = `
${title}
${emoji} <b>${position.coin} ${position.direction}</b> ${emoji}
━━━━━━━━━━━━━━━━
${desc}
💰 Now sits at <b>${profitPercent.toFixed(2)}% profit</b> (Price Move).

👑 <b>Whale</b>: <code>${position.userShort}</code>
💎 <b>Size</b>: ${formatCurrency(position.positionUSD)}
📊 <b>Entry</b>: ${position.entryPrice}
🏷️ <b>Mark</b>: ${position.markPrice}
💰 <b>uPnL</b>: ${formatCurrency(position.unrealizedPnl)}

🔗 <a href="${position.hypurrscanUrl}">View on Hypurrscan</a>
`;

    // Telegram
    await sendTelegramMessage(formatTelegramMessage(msg, position));

    // Twitter
    try {
        const twitterMsg = formatTwitterMessage(msg, position);
        await sendTwitterTweet(twitterMsg);
    } catch (error) {
        console.error('Twitter Error Details:', error.response ? error.response.data : error.message);
    }

    state.sentNotifications.unshift({
        type: 'INSIDER',
        message: msg,
        timestamp: Date.now()
    });
};

const sendPositionCloseAlert = async (position, reason, lastPnl) => {
    const emoji = reason === 'LIQUIDATED' ? '💀' : '🔒';
    const title = reason === 'LIQUIDATED' ? '💀 <b>LIQUIDATED</b> 💀' : '🔒 <b>POSITION CLOSED</b> 🔒';

    const pnlEmoji = lastPnl >= 0 ? '🤑' : '🩸';
    const pnlText = lastPnl ? `${pnlEmoji} Last PnL: ${formatCurrency(lastPnl)}` : '';

    const msg = `
${title}
${position.coin} ${position.direction}
━━━━━━━━━━━━━━━━
👑 <b>Whale</b>: <code>${position.userShort}</code>
💎 <b>Size</b>: ${formatCurrency(position.positionUSD)}
${pnlText}

🔗 <a href="${position.hypurrscanUrl}">View on Hypurrscan</a>
`;

    // Telegram
    await sendTelegramMessage(formatTelegramMessage(msg, position));

    // Twitter
    if (reason === 'LIQUIDATED' || Math.abs(lastPnl) > 50000) {
        try {
            const twitterMsg = formatTwitterMessage(msg, position);
            await sendTwitterTweet(twitterMsg);
        } catch (error) {
            console.error('Twitter Error Details:', error.response ? error.response.data : error.message);
        }
    }
};

module.exports = {
    sendDangerAlert,
    sendNewPositionAlert,
    sendTelegramMessage,
    sendInsiderAlert,
    sendPositionCloseAlert
};
