const express = require('express');
const router = express.Router();
const state = require('../state');
const tracker = require('../services/tracker');
const notifications = require('../services/notifications');

router.get('/positions', (req, res) => {
    res.json(state.trackedPositions);
});

router.get('/new-positions', (req, res) => {
    res.json(state.recentNewPositions);
});

router.get('/liquidations', (req, res) => {
    res.json(state.recentLiquidations);
});

router.get('/sent-notifications', (req, res) => {
    res.json(state.sentNotifications);
});

router.get('/stats', (req, res) => {
    res.json({
        uptime: process.uptime(),
        knownWhales: state.knownUsers.size,
        trackedPositions: state.trackedPositions.length,
        newPositions: state.recentNewPositions.length,
        isInitialLoad: state.isInitialLoad
    });
});

router.post('/add-address', async (req, res) => {
    const { address } = req.body;
    if (address) {
        state.knownUsers.add(address);
        await tracker.checkAddressImmediately(address);
        res.json({ success: true, message: 'Address added and scanned' });
    } else {
        res.status(400).json({ error: 'Address required' });
    }
});

router.post('/test-telegram', async (req, res) => {
    await notifications.sendTelegramMessage('🧪 Test Message from Hyperliquid Tracker');
    res.json({ success: true });
});

module.exports = router;
