const express = require('express');
const cors = require('cors');
const config = require('./config');
const state = require('./state');
const apiRoutes = require('./routes/api');
const websocketService = require('./services/websocket');
const tracker = require('./services/tracker');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/api', apiRoutes);

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
