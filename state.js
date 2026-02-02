// In-memory state storage
const fs = require('fs');
const path = require('path');

const DATA_FILE = process.env.DATA_FILE_PATH || path.join(__dirname, 'data.json');

const state = {
    // Cache for known users/positions to detect "New Whales"
    knownUsers: new Set(),
    knownPositions: new Map(), // Key: "User-Coin", Value: Timestamp

    // Tracked positions for Close/Liq monitoring
    trackedPositions: [],

    // Alert history to prevent spam
    sentAlerts: new Map(), // Key: "DANGER-User-Coin", Value: { timestamp, lastDistance }

    // Recent alerts for frontend
    sentNotifications: [],
    recentNewPositions: [],

    // Locks
    processingLocks: new Set(),

    isInitialLoad: true,

    // Trade Aggregation
    tradeAggregator: new Map(), // key: "user-coin" -> { totalVolume, lastTradeTime, timer }
};

// Load State from Disk
const loadState = () => {
    try {
        if (fs.existsSync(DATA_FILE)) {
            // Check file age
            const stats = fs.statSync(DATA_FILE);
            const now = Date.now();
            const ageMs = now - stats.mtimeMs;
            const isStale = ageMs > 30 * 60 * 1000; // 30 minutes

            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            const data = JSON.parse(raw);

            if (data.knownUsers) {
                state.knownUsers.clear();
                data.knownUsers.forEach(u => {
                    if (u && typeof u === 'string' && u.length > 10) state.knownUsers.add(u);
                });
            }
            if (data.knownPositions) {
                state.knownPositions.clear();
                data.knownPositions.forEach(p => state.knownPositions.set(p[0], p[1]));
            }

            // Only load tracked positions if data is fresh
            if (isStale) {
                console.log(`⚠️ Data file is ${Math.round(ageMs / 60000)} mins old. Discarding tracked positions to prevent spam.`);
                state.trackedPositions = []; // Clear incase it had defaults
            } else {
                if (data.trackedPositions) {
                    const validTracked = data.trackedPositions.filter(p => p.user && typeof p.user === 'string' && p.user.length > 10);
                    state.trackedPositions.splice(0, state.trackedPositions.length, ...validTracked);
                }
            }

            if (data.sentAlerts) {
                state.sentAlerts.clear();
                data.sentAlerts.forEach(a => state.sentAlerts.set(a[0], a[1]));
            }
            if (data.sentNotifications) state.sentNotifications.splice(0, state.sentNotifications.length, ...data.sentNotifications);
            if (data.recentNewPositions) state.recentNewPositions.splice(0, state.recentNewPositions.length, ...data.recentNewPositions);

            state.isInitialLoad = false; // If loaded, not initial
            console.log('💾 State loaded from disk.');
        }
    } catch (error) {
        console.error('Error loading state:', error.message);
    }
};

// Save State to Disk
const saveState = () => {
    try {
        const data = {
            knownUsers: Array.from(state.knownUsers),
            knownPositions: Array.from(state.knownPositions.entries()),
            trackedPositions: state.trackedPositions,
            sentAlerts: Array.from(state.sentAlerts.entries()),
            sentNotifications: state.sentNotifications,
            recentNewPositions: state.recentNewPositions
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        // console.log('💾 State saved.');
    } catch (error) {
        console.error('Error saving state:', error.message);
    }
};

// Load immediately
loadState();

module.exports = {
    ...state,
    saveState
};
