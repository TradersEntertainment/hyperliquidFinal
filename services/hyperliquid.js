
const axios = require('axios');
const state = require('../state');

const API_URL = 'https://api.hyperliquid.xyz/info';

const queue = [];
let isProcessing = false;
let isRateLimited = false;

const processQueue = async () => {
    if (isProcessing || isRateLimited || queue.length === 0) return;

    isProcessing = true;
    const { type, payload, resolve, reject } = queue.shift();

    try {
        const response = await axios.post(API_URL, { type, ...payload }, {
            headers: { 'Content-Type': 'application/json' }
        });
        resolve(response.data);

        // Success? Wait a bit before next request to be safe
        setTimeout(() => {
            isProcessing = false;
            processQueue();
        }, 100); // 100ms delay (10 req/sec max) - Faster but safe

    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.warn(`⚠️ API Rate Limit (429). Pausing for 5 seconds...`);
            isRateLimited = true;
            // Put request back in front of queue
            queue.unshift({ type, payload, resolve, reject });

            setTimeout(() => {
                isRateLimited = false;
                isProcessing = false;
                processQueue();
            }, 5000);
        } else {
            if (error.response && error.response.status === 422) {
                console.error(`API Error(${type}) 422: Invalid Request. Payload:`, JSON.stringify(payload));
            } else {
                console.error(`API Error(${type}): `, error.message);
            }
            resolve(null); // Resolve with null so we don't crash caller

            isProcessing = false;
            processQueue();
        }
    }
};

const postRequest = (type, payload = {}) => {
    return new Promise((resolve, reject) => {
        queue.push({ type, payload, resolve, reject });
        processQueue();
    });
};

const getUserState = async (user) => {
    return await postRequest('clearinghouseState', { user });
};

const getUserFills = async (user) => {
    try {
        const response = await axios.post(API_URL, {
            type: 'userFills',
            user: user
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching user fills:', error.message);
        return [];
    }
};

const getMeta = async () => {
    return await postRequest('meta');
};

const getMetaAndAssetCtxs = async () => {
    return await postRequest('metaAndAssetCtxs');
};

module.exports = {
    getUserState,
    getMeta,
    getMetaAndAssetCtxs,
    getUserFills
};
