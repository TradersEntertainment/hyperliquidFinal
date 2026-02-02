const state = require('../state');
const config = require('../config');
const hyperliquid = require('./hyperliquid');
const notifications = require('./notifications');

// Helper to format address
const shortAddress = (addr) => `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;

// Process a single position for DANGER tracking
const processPosition = async (position, user, triggeringTrade = null) => {
    // Danger Tracking Criteria:
    // - Minimum: $2M (from config)
    // - Distance to Liq: <= 10%

    const positionValue = parseFloat(position.positionValue); // This needs to be calculated or derived
    // Note: Hyperliquid API returns 'szi' (size in coin) and 'entryPx'. 
    // We need current price to calculate accurate USD value, but for now we can use entryPx * szi as approx or fetch mark price.
    // The prompt schema suggests we have 'positionUSD'.
    // Let's assume the caller enriches the position object or we calculate it here.

    // Actually, let's look at what getUserState returns. It returns asset positions.
    // We need mark prices to calculate current value and liquidation distance accurately.
    // For this implementation, we will rely on the data passed to us being enriched or we fetch it.

    if (position.positionUSD < config.MIN_POSITION_USD) return;

    // --- INSIDER DETECTION ---
    if (position.positionUSD > 10000000) {
        const isMajor = config.SAFE_COINS.includes(position.coin);
        const threshold = isMajor ? 7 : 15;

        let profitPercent = 0;
        if (position.direction === 'LONG') {
            profitPercent = ((position.markPrice - position.entryPrice) / position.entryPrice) * 100;
        } else {
            profitPercent = ((position.entryPrice - position.markPrice) / position.entryPrice) * 100;
        }

        if (profitPercent > threshold) {
            const insiderKey = `INSIDER-${user.toLowerCase().trim()}-${position.coin}`;

            // Check if Taking Profit
            let isTakingProfit = false;
            if (triggeringTrade && triggeringTrade.coin === position.coin) {
                // If Long and Selling (A) -> Closing
                // If Short and Buying (B) -> Closing
                const isBuy = triggeringTrade.side === 'B';
                if (position.direction === 'LONG' && !isBuy) isTakingProfit = true;
                if (position.direction === 'SHORT' && isBuy) isTakingProfit = true;
            }

            // Lock/Check
            // If taking profit, we might want to alert even if we alerted before? 
            // Or maybe just update the message?
            // Let's use a separate key for profit taking? "INSIDER-PROFIT-..."
            // User said: "cüzdan oradan açtığı shortları twap emri gibi bir şeyle parça parça kapatıyordu yani shorttan kar alıyordu bu güzel bir info bunu da atlamayalım"
            // So yes, alert on profit taking.

            const alertKey = isTakingProfit ? `INSIDER-PROFIT-${user}-${position.coin}` : insiderKey;

            if (!state.sentAlerts.has(alertKey)) {
                state.sentAlerts.set(alertKey, Date.now());
                // Send Alert
                await notifications.sendInsiderAlert(position, profitPercent, isTakingProfit);
            }
        }
    }
    // -------------------------

    const distancePercent = parseFloat(position.distancePercent);

    if (distancePercent <= 2) {
        const alertKey = `DANGER-${user.toLowerCase().trim()}-${position.coin}`;

        // 1. LOCKING: Prevent concurrent processing of the same alert
        if (state.processingLocks.has(alertKey)) return;
        state.processingLocks.add(alertKey);

        try {
            const now = Date.now();
            let isRecurring = false;

            // Debug Log: Print Map Keys to see if we are missing it
            // console.log(`[DEBUG] Current Keys: ${Array.from(state.sentAlerts.keys())}`);
            // console.log(`[DEBUG] Checking Key: ${alertKey}`);

            // Cooldown & Worsening Check
            if (state.sentAlerts.has(alertKey)) {
                const data = state.sentAlerts.get(alertKey);
                const lastSent = typeof data === 'number' ? data : data.timestamp;
                const lastDistance = typeof data === 'number' ? 100 : data.lastDistance;

                // console.log(`[DEBUG] Found Key! Last Sent: ${new Date(lastSent).toISOString()}, Dist: ${lastDistance}%`);

                // HYBRID RULE:
                // 1. If less than 3 hours have passed...
                if (now - lastSent < 3 * 60 * 60 * 1000) {
                    // 2. ...AND the situation hasn't worsened by 0.5%...
                    if (distancePercent > lastDistance - 0.5) {
                        // console.log(`[DEBUG] Skipped ${alertKey} (Not worsened enough: ${distancePercent} vs ${lastDistance})`);
                        return;
                    }
                    // If it HAS worsened, we proceed (Bypass cooldown)
                }

                isRecurring = true;
            } else {
                // console.log(`[DEBUG] Key ${alertKey} NOT found in map.`);
            }

            // Set immediately 
            state.sentAlerts.set(alertKey, { timestamp: now, lastDistance: distancePercent });

            // Check if already tracked to avoid duplicates in the array (though we might want to update it)
            const existingIndex = state.trackedPositions.findIndex(p => p.user === user && p.coin === position.coin);

            const trackedPos = {
                ...position,
                user,
                userShort: shortAddress(user),
                dangerLevel: distancePercent <= 3 ? 'CRITICAL' : 'WARNING',
                timestamp: now,
                isRecurring
            };

            if (existingIndex >= 0) {
                state.trackedPositions[existingIndex] = trackedPos;
            } else {
                state.trackedPositions.push(trackedPos);
            }

            // Send Alert
            await notifications.sendDangerAlert(trackedPos);

        } finally {
            // Unlock after processing is done (or failed)
            state.processingLocks.delete(alertKey);
        }
    }
};

// Helper to get wallet stats (Age)
const getWalletStats = async (user) => {
    const fills = await hyperliquid.getUserFills(user);
    console.log(`[DEBUG] Fills for ${user}: ${fills ? fills.length : 'null'}`);

    if (!fills || fills.length === 0) return { ageDays: 0, isFresh: true };

    // Find oldest fill
    // Fills are usually sorted new to old, but let's be safe
    // Actually Hyperliquid returns them sorted. Last item is oldest? Or first?
    // Let's assume we iterate to find min time.
    let minTime = Date.now();
    for (const fill of fills) {
        if (fill.time < minTime) minTime = fill.time;
    }

    const ageMs = Date.now() - minTime;
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    console.log(`[DEBUG] Wallet Age for ${user}: ${ageDays} days`);

    return {
        ageDays,
        isFresh: ageDays < 7 // Less than 7 days considered fresh
    };
};

// Process a single position for NEW WHALE tracking
const processAllPosition = async (position, user) => {
    // New Whale Criteria:
    // - Size > $10M (Strict)
    // - Fresh Wallet (< 7 days) OR Hypervault Attack

    // Hypervault Attack Detection
    const isHypervault = user.toLowerCase() === config.HYPERVAULT_ADDRESS.toLowerCase();
    let isHypervaultAttack = false;

    if (isHypervault) {
        if (!config.SAFE_COINS.includes(position.coin)) {
            if (position.positionUSD > 500000) {
                isHypervaultAttack = true;
            }
        }
    } else {
        // Dynamic Thresholds based on Coin Type
        const isMajor = config.SAFE_COINS.includes(position.coin);
        const minSize = isMajor ? 10000000 : 3000000; // $10M for Majors, $3M for Alts

        if (position.positionUSD < minSize) return;
    }

    const posKey = `${user}-${position.coin}`;

    // Check if known position
    if (!state.knownPositions.has(posKey)) {

        if (state.isInitialLoad) {
            state.knownPositions.set(posKey, Date.now());
            state.knownUsers.add(user);
            return;
        }

        // Check if user is NEW (Fresh Wallet)
        const walletStats = await getWalletStats(user);

        // STRICT CHECK:
        // User is fresh ONLY if:
        // 1. Not in our known list (session based)
        // 2. AND Wallet age is < 7 days (API based)
        const isFreshWallet = !state.knownUsers.has(user) && walletStats.isFresh;

        // NEW CHECK: Entry Price vs Mark Price (Is it truly new?)
        let isOldPosition = false;
        if (!isHypervaultAttack && position.entryPrice && position.markPrice) {
            const priceDev = Math.abs((position.markPrice - position.entryPrice) / position.entryPrice);
            if (priceDev > 0.05) { // 5% difference
                isOldPosition = true;
            }
        }

        // STRICT USER REQUEST: Only alert if Liq Distance is risky
        // Majors: < 5%
        // Alts: < 10%
        const distancePercent = parseFloat(position.distancePercent);
        const isMajor = config.SAFE_COINS.includes(position.coin);
        const maxLiqDist = isMajor ? 5 : 10;

        if (!isHypervaultAttack && distancePercent > maxLiqDist) {
            // console.log(`[INFO] Skipped safe new whale ${user} (Dist: ${distancePercent}%)`);
            state.knownPositions.set(posKey, Date.now());
            state.knownUsers.add(user);
            return;
        }

        // Add to known
        state.knownPositions.set(posKey, Date.now());
        state.knownUsers.add(user);

        // Alert Conditions:
        // 1. Hypervault Attack (CRITICAL)
        // 2. Fresh Wallet + Large Position + NOT Old Position
        if (isHypervaultAttack || (isFreshWallet && !isOldPosition)) {
            const newPos = {
                ...position,
                user,
                userShort: shortAddress(user),
                timestamp: Date.now(),
                isFreshWallet,
                walletAgeDays: walletStats.ageDays,
                isHypervaultAttack
            };

            // Add to recent list
            state.recentNewPositions.unshift(newPos);
            if (state.recentNewPositions.length > 100) state.recentNewPositions.pop();

            // Add to tracked positions for Close/Liq monitoring
            if (user && user.length > 10) {
                const existingIndex = state.trackedPositions.findIndex(p => p.user === user && p.coin === position.coin);
                if (existingIndex >= 0) {
                    state.trackedPositions[existingIndex] = { ...newPos, type: 'NEW' };
                } else {
                    state.trackedPositions.push({ ...newPos, type: 'NEW' });
                }
            }

            // Send Alert
            await notifications.sendNewPositionAlert(newPos);
        } else {
            console.log(`[INFO] Skipped alert for ${user} (Age: ${walletStats.ageDays}d, OldPos: ${isOldPosition})`);
        }
    }
};

const calculatePositionDetails = (pos, universe, assetCtxs, accountValue = 0) => {
    // pos: { coin: 'BTC', szi: '1.5', entryPx: '95000', unrealizedPnl: '123.4', ... }
    // universe: array of assets info
    // assetCtxs: array of asset contexts (prices)

    const assetIndex = universe.findIndex(u => u.name === pos.coin);
    if (assetIndex === -1) return null;

    const ctx = assetCtxs[assetIndex];
    if (!ctx) return null;

    const markPx = parseFloat(ctx.markPx);
    const szi = parseFloat(pos.szi);
    const entryPx = parseFloat(pos.entryPx);
    const positionUSD = Math.abs(szi * markPx);
    const leverage = (pos.leverage && pos.leverage.value) ? pos.leverage.value : (positionUSD / (parseFloat(pos.marginUsed) || positionUSD / 10)); // Fallback if margin not clear

    // PnL
    const unrealizedPnl = parseFloat(pos.unrealizedPnl) || 0;

    // Liquidation Price Calculation (Simplified approximation if not provided)
    // Hyperliquid returns liquidationPx in some endpoints, or we estimate.
    // The 'clearinghouseState' usually contains liquidationPx? 
    // Actually, clearinghouseState -> assetPositions -> position -> liquidationPx might not be there directly.
    // But let's assume we can get it or estimate it. 
    // For this task, let's assume the 'pos' object from clearinghouseState has what we need or we calculate.
    // Actually, clearinghouseState has 'marginSummary' and 'assetPositions'.
    // Let's try to use what's available.

    let liqPrice = null;
    if (pos.liquidationPx) {
        liqPrice = parseFloat(pos.liquidationPx);
    }

    const isLong = szi > 0;
    const direction = isLong ? 'LONG' : 'SHORT';

    // Distance
    let distancePercent = null;
    if (liqPrice) {
        distancePercent = Math.abs((markPx - liqPrice) / markPx) * 100;
    }

    return {
        user: '', // Set by caller
        coin: pos.coin,
        direction,
        positionSize: Math.abs(szi),
        positionUSD,
        entryPrice: entryPx,
        markPrice: markPx,
        liqPrice,
        distanceToLiq: distancePercent ? distancePercent / 100 : null,
        distancePercent: distancePercent ? distancePercent.toFixed(2) : 'N/A',
        leverage: Math.round(leverage), // Approx
        unrealizedPnl,
        accountEquity: parseFloat(accountValue),
        hypurrscanUrl: `https://hypurrscan.io/address/`, // Caller appends address
        hyperliquidUrl: `https://app.hyperliquid.xyz/explorer/address/` // Caller appends address
    };
};

const checkAddressImmediately = async (user) => {
    try {
        const [userState, metaAndAssetCtxs] = await Promise.all([
            hyperliquid.getUserState(user),
            hyperliquid.getMetaAndAssetCtxs()
        ]);

        if (!userState || !metaAndAssetCtxs) return;

        const universe = metaAndAssetCtxs[0].universe;
        const assetCtxs = metaAndAssetCtxs[1];

        for (const pos of userState.assetPositions) {
            const coin = pos.position.coin;
            const szi = parseFloat(pos.position.szi);
            if (szi === 0) continue;

            const accountValue = userState.marginSummary ? userState.marginSummary.accountValue : 0;
            const enrichedPos = calculatePositionDetails(pos.position, universe, assetCtxs, accountValue);
            if (!enrichedPos) continue;

            enrichedPos.user = user;
            enrichedPos.userShort = shortAddress(user); // Fix undefined whale
            enrichedPos.hypurrscanUrl += user;
            enrichedPos.hyperliquidUrl += user;

            // 1. Process Danger
            await processPosition(enrichedPos, user);

            // 2. Process New
            await processAllPosition(enrichedPos, user);
        }

    } catch (error) {
        console.error(`Error checking address ${user}:`, error.message);
    }
};

// Periodic check for tracked positions
const checkTrackedPositions = async () => {
    if (state.trackedPositions.length === 0) return;

    // Get unique users (Filter out invalid ones)
    const users = [...new Set(state.trackedPositions.map(p => p.user))].filter(u => u && typeof u === 'string' && u.length > 10);

    // Fetch meta once
    const metaResponse = await hyperliquid.getMetaAndAssetCtxs();
    if (!metaResponse) return; // Meta failed
    const [meta, assetCtxs] = metaResponse;
    const universe = meta.universe;

    for (const user of users) {
        try {
            const userState = await hyperliquid.getUserState(user);
            if (!userState) {
                // If it fails, it might be a temporary API issue OR an invalid user.
                // If 422, we saw the log in hyperliquid.js.
                // Let's count failures? For now just warn.
                // console.warn(`[WARN] Could not fetch state for user ${user}`);
                continue;
            }

            const userPositions = userState.assetPositions;
            if (!userPositions) continue;

            // Filter tracked positions for this user
            const trackedForUser = state.trackedPositions.filter(p => p.user === user);

            for (const tracked of trackedForUser) {
                // Find current position in API response
                const currentPosRaw = userPositions.find(p => p.position.coin === tracked.coin);

                if (currentPosRaw) {
                    // Position still exists, update it
                    const currentPos = currentPosRaw.position;
                    const details = calculatePositionDetails(currentPos, universe, assetCtxs);

                    if (details) {
                        // Update tracked state
                        Object.assign(tracked, details);
                        tracked.timestamp = Date.now();
                    }
                } else {
                    // Position is GONE -> Closed or Liquidated
                    // Determine reason
                    let reason = 'CLOSED';

                    // Check if it was close to liquidation
                    // If current Mark Price crossed Liquidation Price?
                    // We need current mark price for the coin
                    const assetIndex = universe.findIndex(u => u.name === tracked.coin);
                    const ctx = assetCtxs[assetIndex];
                    if (ctx) {
                        const currentMark = parseFloat(ctx.markPx);
                        const liqPrice = tracked.liqPrice;

                        if (liqPrice) {
                            if (tracked.direction === 'LONG' && currentMark <= liqPrice) reason = 'LIQUIDATED';
                            if (tracked.direction === 'SHORT' && currentMark >= liqPrice) reason = 'LIQUIDATED';
                        }
                    }

                    // Send Alert
                    await notifications.sendPositionCloseAlert(tracked, reason, tracked.unrealizedPnl);

                    // Remove from tracked
                    const index = state.trackedPositions.indexOf(tracked);
                    if (index > -1) {
                        state.trackedPositions.splice(index, 1);
                    }
                }
            }
        } catch (error) {
            console.error(`Error checking user ${user}:`, error.message);
        }
    }
};

module.exports = {
    processPosition,
    processAllPosition,
    checkAddressImmediately,
    checkTrackedPositions
};
