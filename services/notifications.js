const TelegramBot = require('node-telegram-bot-api');
const { TwitterApi } = require('twitter-api-v2');
const config = require('../config');
const state = require('../state');

// Initialize Telegram
let bot = null;
if (config.TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: false });
}

// Initialize Altcoin Telegram Bot
let botAlt = null;
if (config.TELEGRAM_BOT_TOKEN_ALT) {
    botAlt = new TelegramBot(config.TELEGRAM_BOT_TOKEN_ALT, { polling: false });
}

// Initialize Twitter
let twitterClient = null;
if (config.TWITTER_API_KEY && config.TWITTER_API_SECRET && config.TWITTER_ACCESS_TOKEN && config.TWITTER_ACCESS_SECRET) {
    try {
        twitterClient = new TwitterApi({
            appKey: config.TWITTER_API_KEY,
            appSecret: config.TWITTER_API_SECRET,
            accessToken: config.TWITTER_ACCESS_TOKEN,
            accessSecret: config.TWITTER_ACCESS_SECRET,
        });
        console.log('✅ Twitter Client Initialized Successfully');
    } catch (err) {
        console.error('❌ Failed to Initialize Twitter Client:', err.message);
    }
} else {
    console.warn('⚠️ Twitter API Keys missing in config. Twitter notifications disabled.');
}

const formatCurrency = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toFixed(2)}`;
};

const sendTelegramMessage = async (message, coin = null) => {
    const promises = [];

    // 1. Send to Main Channel (Always)
    if (bot && config.TELEGRAM_CHANNEL_ID) {
        promises.push(
            bot.sendMessage(config.TELEGRAM_CHANNEL_ID, message, { parse_mode: 'HTML', disable_web_page_preview: true })
                .catch(err => console.error('Telegram Main Error:', err.message))
        );
    }

    // 2. Send to Altcoin Channel (If applicable)
    // We consider everything except BTC and ETH as an "Altcoin" for this purpose (including SOL, BNB, etc.)
    const isMajor = ['BTC', 'ETH'].includes(coin);
    if (botAlt && config.TELEGRAM_CHANNEL_ID_ALT && coin && !isMajor) {
        promises.push(
            botAlt.sendMessage(config.TELEGRAM_CHANNEL_ID_ALT, message, { parse_mode: 'HTML', disable_web_page_preview: true })
                .catch(err => console.error('Telegram Alt Error:', err.message))
        );
    }

    await Promise.all(promises);
};

const twitterQueue = [];
let isProcessingQueue = false;

const processTwitterQueue = async () => {
    if (isProcessingQueue) {
        // console.log('⏳ Queue is busy, waiting...');
        return;
    }

    if (twitterQueue.length === 0) return;

    // --- Rate Limit & Daily Reset Logic ---
    const now = Date.now();
    if (now - state.lastTweetResetTime > 24 * 60 * 60 * 1000) {
        console.log(`🔄 Resetting Daily Tweet Count (Old: ${state.dailyTweetCount})`);
        state.dailyTweetCount = 0;
        state.lastTweetResetTime = now;
        state.saveState();
    }

    if (state.dailyTweetCount >= config.TWITTER_DAILY_LIMIT) {
        console.warn(`🛑 Twitter Daily Limit Reached (${state.dailyTweetCount}/${config.TWITTER_DAILY_LIMIT}). Dropping tweet...`);
        // Remove the dropped tweet from queue so we don't get stuck
        twitterQueue.shift();
        // Try next one immediately (recursion with safety check handled by queue length)
        processTwitterQueue();
        return;
    }
    // --------------------------------------

    isProcessingQueue = true;
    const text = twitterQueue.shift();

    console.log(`🚀 Attempting to send tweet... (Queue: ${twitterQueue.length}, Daily: ${state.dailyTweetCount})`);

    try {
        if (twitterClient) {
            await twitterClient.v2.tweet(text);
            state.dailyTweetCount++;
            state.saveState();
            console.log(`✅ Tweet sent! (${state.dailyTweetCount}/${config.TWITTER_DAILY_LIMIT})`);
        } else {
            console.error('❌ Twitter Client is NULL! Check API Keys in .env');
        }
    } catch (error) {
        console.error('❌ Twitter Error:', error.code || error.message);
        if (error.data) console.error('Error Data:', JSON.stringify(error.data, null, 2));

        // If Rate Limit (429), pause for 15 mins
        if (error.code === 429 || error.status === 429) {
            console.log('⏳ Twitter Rate Limit hit in API. Pausing queue for 15 mins...');
            twitterQueue.unshift(text); // Put back to retry
            setTimeout(() => {
                isProcessingQueue = false;
                processTwitterQueue();
            }, 15 * 60 * 1000);
            return; // Exit, timeout will restart
        }
    }

    // Wait 30 seconds before next tweet to be safe and avoid rapid-fire bans
    setTimeout(() => {
        isProcessingQueue = false;
        processTwitterQueue();
    }, 30000);
};

const sendTwitterTweet = async (text) => {
    if (!twitterClient) {
        console.warn('⚠️ Cannot queue tweet: Twitter Client is not initialized.');
        return;
    }
    console.log('➕ Adding tweet to queue:', text.split('\n')[0] + '...');
    twitterQueue.push(text);
    processTwitterQueue();
};

// --- Helper Functions for Formatting ---

const formatTelegramMessage = (baseMsg, position) => {
    // Append Coin Hashtag to Telegram message
    return `${baseMsg}\n#${position.coin}`;
};

const formatTwitterMessage = (baseMsg, position) => {
    // Construct a COMPACT message specifically for Twitter (Max 280 chars)

    // Title
    const emoji = position.direction === 'LONG' ? '🟢' : '🔴';
    let title = `${emoji} #${position.coin} ${position.direction}`;

    // Compact Details
    const sizeStr = formatCurrency(position.positionUSD);
    const distStr = position.distancePercent ? `${position.distancePercent}%` : 'N/A';

    // Short Message Construction
    let twitterMsg = `${title}\n`;
    twitterMsg += `💎 Size: ${sizeStr} | ⚡ x${position.leverage}\n`;
    twitterMsg += `💵 Equity: ${formatCurrency(position.accountEquity)}\n`;
    twitterMsg += `📊 Entry: ${position.entryPrice}\n`;
    twitterMsg += `💀 Dist to Liq: ${distStr}\n`;

    // Add Link
    twitterMsg += `\n${position.hypurrscanUrl}`;

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
    await sendTelegramMessage(formatTelegramMessage(msg, position), position.coin);

    // Twitter
    // Only Tweet if VERY urgent (< 10% distance) or Significant PnL (Bag Holder/Smart Whale)
    // OR if Recurring (Risk Increasing)
    const sizeStr = formatCurrency(position.positionUSD);
    const isLargePosition = position.positionUSD >= 3000000;
    if (position.isRecurring || pnlTag || isLargePosition) {
        // Filter: Dont spam Twitter with small BTC/ETH recurring updates (Min 3M)
        if (['BTC', 'ETH'].includes(position.coin) && position.positionUSD < 3000000) {
            return;
        }

        try {
            // Custom Compact Message for Danger/Risk
            let tTitle = `📡 JUST CAUGHT ON RADAR 📡`;
            // Compact Header for Twitter
            // $67M #BTC SHORT (1% to Liq)
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

            // Removed separate "Dist to Liq" line for Twitter as well since it's in header
            if (position.liqPrice) twitterMsg += `💀 Liq Price: ${parseFloat(position.liqPrice).toFixed(2)}\n`;
            twitterMsg += `📊 Entry: ${position.entryPrice}\n`;

            // Add PnL if significant
            if (pnlTag) {
                const pnlStr = pnl >= 0 ? `+$${formatCurrency(pnl)}` : `-$${formatCurrency(Math.abs(pnl))}`;
                twitterMsg += `💰 PnL: ${pnlStr}\n`;
            }

            twitterMsg += `🔗 ${position.hypurrscanUrl}\n`;
            twitterMsg += `#${position.coin} #Whale #Hyperliquid`;

            await sendTwitterTweet(twitterMsg);
        } catch (error) {
            console.error('Twitter Error Details:', error.response ? error.response.data : error.message);
        }
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
    await sendTelegramMessage(formatTelegramMessage(msg, position), position.coin);

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
🏦 <b>Equity</b>: ${formatCurrency(position.accountEquity)}
📊 <b>Entry</b>: ${position.entryPrice}
🏷️ <b>Mark</b>: ${position.markPrice}
💰 <b>uPnL</b>: ${formatCurrency(position.unrealizedPnl)}

🔗 <a href="${position.hypurrscanUrl}">View on Hypurrscan</a>
`;

    // Telegram
    await sendTelegramMessage(formatTelegramMessage(msg, position), position.coin);

    // Twitter
    try {
        // Custom message for Insider to include specific details (Profit, Context)
        const emoji = position.direction === 'LONG' ? '🟢' : '🔴';

        let tTitle = '🚨 INSIDER DETECTED 🚨';
        let tDesc = `⚠️ ${action} before ${dumpPump}`;

        if (isTakingProfit) {
            const fromDir = position.direction === 'LONG' ? 'LONGS' : 'SHORTS';
            tTitle = `💰 INSIDER PROFIT 💰`;
            tDesc = `⚠️ Taking Profit from ${fromDir}`;
        }

        let twitterMsg = `${tTitle}\n`;
        twitterMsg += `${emoji} #${position.coin} ${position.direction}\n`;
        twitterMsg += `${tDesc}\n`;
        twitterMsg += `💰 Profit: ${profitPercent.toFixed(2)}%\n`;
        twitterMsg += `💎 Size: ${formatCurrency(position.positionUSD)}\n`;
        twitterMsg += `💵 Equity: ${formatCurrency(position.accountEquity)}\n`;
        twitterMsg += `🔗 ${position.hypurrscanUrl}\n`;
        twitterMsg += `#${position.coin} #Inside #Hyperliquid`;

        await sendTwitterTweet(twitterMsg);
    } catch (error) {
        if (error.response && error.response.status === 403) {
            console.error('❌ Twitter 403 FORBIDDEN: Please check your API Keys. Ensure "Read and Write" permissions are enabled in Twitter Developer Portal.');
            console.error('ℹ️ You may need to regenerate your Access Token & Secret after changing permissions.');
        } else {
            console.error('Twitter Error Details:', error.response ? error.response.data : error.message);
        }
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
🏦 <b>Equity</b>: ${formatCurrency(position.accountEquity)}
${pnlText}

🔗 <a href="${position.hypurrscanUrl}">View on Hypurrscan</a>
`;

    // Telegram
    await sendTelegramMessage(formatTelegramMessage(msg, position), position.coin);

    // Twitter
    // REMOVED per user request: "liq closed bildirimlerine gerek yok twitterda"
    // if (reason === 'LIQUIDATED' || Math.abs(lastPnl) > 50000) {
    //     try {
    //         const twitterMsg = formatTwitterMessage(msg, position);
    //         await sendTwitterTweet(twitterMsg);
    //     } catch (error) {
    //         console.error('Twitter Error Details:', error.response ? error.response.data : error.message);
    //     }
    // }
};

module.exports = {
    sendDangerAlert,
    sendNewPositionAlert,
    sendTelegramMessage,
    sendInsiderAlert,
    sendPositionCloseAlert
};
