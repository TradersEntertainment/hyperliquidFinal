
require('dotenv').config();

module.exports = {
    // Hypervault Tracking
    HYPERVAULT_ADDRESS: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
    SAFE_COINS: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'TRX', 'LINK', 'MATIC', 'DOT', 'LTC', 'UNI', 'ATOM', 'NEAR', 'ARB', 'OP', 'SUI', 'APT'],

    PORT: process.env.PORT || 3000,
    MIN_POSITION_USD: process.env.MIN_POSITION_USD || 2000000, // $2M for danger
    MIN_TRADE_USD: process.env.MIN_TRADE_USD || 100000, // $100k for filtering
    REFRESH_INTERVAL: process.env.REFRESH_INTERVAL || 60000,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHANNEL_ID: process.env.TELEGRAM_CHANNEL_ID,
    TELEGRAM_BOT_TOKEN_ALT: process.env.TELEGRAM_BOT_TOKEN_ALT,
    TELEGRAM_CHANNEL_ID_ALT: process.env.TELEGRAM_CHANNEL_ID_ALT,
    TWITTER_API_KEY: process.env.TWITTER_API_KEY,
    TWITTER_API_SECRET: process.env.TWITTER_API_SECRET,
    TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
    TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET,
    DATABASE_URL: process.env.DATABASE_URL
};
