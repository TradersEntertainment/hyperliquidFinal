const WebSocket = require('ws');
const tracker = require('./tracker');
const config = require('../config');
const state = require('../state');

const WS_URL = 'wss://api.hyperliquid.xyz/ws';
let ws;
let pingInterval;

const hyperliquid = require('./hyperliquid'); // Import hyperliquid service

const connect = () => {
    ws = new WebSocket(WS_URL);

    ws.on('open', async () => {
        console.log('✅ WebSocket connected');

        // Fetch all coins to subscribe to
        try {
            const meta = await hyperliquid.getMeta();

            if (meta && meta.universe) {
                const coins = meta.universe.map(u => u.name);
                console.log(`Found ${coins.length} coins. Starting batched subscription...`);

                // Batched subscription: 10 coins per batch, 1s delay
                const BATCH_SIZE = 10;
                for (let i = 0; i < coins.length; i += BATCH_SIZE) {
                    const batch = coins.slice(i, i + BATCH_SIZE);

                    for (const coin of batch) {
                        ws.send(JSON.stringify({
                            method: 'subscribe',
                            subscription: { type: 'trades', coin: coin }
                        }));
                    }

                    console.log(`Subscribed to ${Math.min(i + BATCH_SIZE, coins.length)}/${coins.length} coins...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                console.log('✅ All subscriptions sent.');
            } else {
                console.error('❌ Failed to fetch meta (meta or universe missing). Response:', JSON.stringify(meta));
                // Fallback
                const coins = ['BTC', 'ETH', 'SOL'];
                console.log(`Falling back to top ${coins.length} coins: ${coins.join(', ')}...`);
                for (const coin of coins) {
                    ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'trades', coin } }));
                }
            }
        } catch (e) {
            console.error('Subscription Error (getMeta failed):', e);
            // Fallback on error
            const coins = ['BTC', 'ETH', 'SOL'];
            console.log(`Falling back to top ${coins.length} coins due to error...`);
            for (const coin of coins) {
                ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'trades', coin } }));
            }
        }



        // Keep-alive
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ method: 'ping' }));
            }
        }, 30000);
    });

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);

            // DEBUG: Log ALL messages to see what's happening
            if (message.channel === 'subscriptionResponse') {
                console.log('✅ Subscription Confirmed:', message.data);
            } else if (message.channel !== 'trades') {
                console.log('WS Message:', message);
            }


            if (message.channel === 'trades') {
                const trades = message.data;
                // console.log(`📡 Received ${trades.length} trades. Sample:`, JSON.stringify(trades[0]));

                for (const trade of trades) {
                    const value = parseFloat(trade.px) * parseFloat(trade.sz);

                    if (value >= 1000) { // Aggregate everything > $1k to catch split orders
                        // Hyperliquid public trades return 'users' array [maker, taker]
                        const users = (trade.users || [trade.user, trade.maker, trade.taker])
                            .filter(u => u && typeof u === 'string' && u.length > 10); // Strict filter

                        for (const user of users) {
                            const aggKey = `${user}-${trade.coin}`;
                            let agg = state.tradeAggregator.get(aggKey);

                            if (!agg) {
                                agg = { totalVolume: 0, lastTradeTime: Date.now(), timer: null };
                                state.tradeAggregator.set(aggKey, agg);
                            }

                            agg.totalVolume += value;
                            agg.lastTradeTime = Date.now();

                            // Clear existing timer to debounce
                            if (agg.timer) clearTimeout(agg.timer);

                            // Set new timer to check after 5 seconds of silence
                            agg.timer = setTimeout(async () => {
                                if (agg.totalVolume >= 200000) { // $200k Threshold
                                    console.log(`🐋 Aggregated Whale Trade: $${(agg.totalVolume / 1000).toFixed(1)}K by ${user} on ${trade.coin}`);
                                    // Check this user's positions immediately
                                    // Pass the trade info to detect if they are closing/opening
                                    const tradeInfo = {
                                        coin: trade.coin,
                                        side: trade.s, // 'B' or 'A' (Bid/Ask) -> Buy/Sell
                                        size: parseFloat(trade.sz),
                                        price: parseFloat(trade.px),
                                    };
                                    await tracker.checkAddressImmediately(user, tradeInfo);
                                }
                                state.tradeAggregator.delete(aggKey); // Cleanup
                            }, 5000);

                            // Immediate check if huge single trade (optional, but good for speed)
                            if (value >= 200000) {
                                console.log(`🐋 Whale Trade (Instant): $${(value / 1000).toFixed(1)}K by ${user} on ${trade.coin}`);
                                await tracker.checkAddressImmediately(user);
                                // Don't delete yet, let aggregator finish in case more comes
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('WS Message Error:', e);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`WebSocket disconnected (Code: ${code}, Reason: ${reason}). Reconnecting...`);
        clearInterval(pingInterval);
        setTimeout(connect, 5000);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
    });
};

module.exports = { connect };
