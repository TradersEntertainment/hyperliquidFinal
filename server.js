const express = require('express');
const cors = require('cors');
const config = require('./config');
const state = require('./state');
const notifications = require('./services/notifications');
const websocketService = require('./services/websocket');
const tracker = require('./services/tracker');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ... API Routes (Inlined to avoid file path issues on deployment) ...
const apiRouter = express.Router();

apiRouter.get('/positions', (req, res) => {
    res.json(state.trackedPositions);
});

apiRouter.get('/new-positions', (req, res) => {
    res.json(state.recentNewPositions);
});

apiRouter.get('/liquidations', (req, res) => {
    res.json(state.recentLiquidations);
});

apiRouter.get('/sent-notifications', (req, res) => {
    res.json(state.sentNotifications);
});

apiRouter.get('/stats', (req, res) => {
    res.json({
        uptime: process.uptime(),
        knownWhales: state.knownUsers.size,
        trackedPositions: state.trackedPositions.length,
        newPositions: state.recentNewPositions.length,
        isInitialLoad: state.isInitialLoad
    });
});

apiRouter.post('/add-address', async (req, res) => {
    const { address } = req.body;
    if (address) {
        state.knownUsers.add(address);
        await tracker.checkAddressImmediately(address);
        res.json({ success: true, message: 'Address added and scanned' });
    } else {
        res.status(400).json({ error: 'Address required' });
    }
});

apiRouter.post('/test-telegram', async (req, res) => {
    await notifications.sendTelegramMessage('🧪 Test Message from Hyperliquid Tracker');
    res.json({ success: true });
});

app.use('/api', apiRouter);

// Start Server
app.listen(config.PORT, () => {
    console.log(`🚀 Starting HL Liquidation Hunter on port ${config.PORT}...`);
    console.log(`✅ Loaded configuration`);

    // Start WebSocket
    websocketService.connect();

    // Start Periodic Check for Tracked Positions (Every 1 minute)
    setInterval(() => {
        tracker.checkTrackedPositions();
    }, 60000);

    // Save State Periodically (Every 1 minute)
    setInterval(() => {
        state.saveState();
    }, 60000);

    // Initial Scan Simulation (since we don't have a DB of whales yet)
    // In a real app, we'd load from DB. Here we rely on discovery.
    console.log('🔍 Initializing system...');

    setTimeout(() => {
        state.isInitialLoad = false;
        console.log('✅ Initial load complete. Now monitoring for NEW positions...');
    }, 10000); // 10 seconds warmup
});

// Background Jobs
setInterval(() => {
    // Refresh tracked positions
    // In a real app, we would iterate knownWhaleAddresses and call checkAddressImmediately
    // For now, we rely on the WS to trigger checks, but let's add a periodic re-check for tracked positions
    // to update their PnL/Distance.

    // This is a simplified version of "refreshPositions"
    state.trackedPositions.forEach(async (pos) => {
        await tracker.checkAddressImmediately(pos.user);
    });
}, config.REFRESH_INTERVAL);
