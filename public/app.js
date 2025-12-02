const API_URL = '/api';

const formatCurrency = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toFixed(2)}`;
};

const formatDate = (ts) => {
    return new Date(ts).toLocaleTimeString();
};

const renderPositionCard = (pos) => {
    const isCritical = pos.dangerLevel === 'CRITICAL';
    const typeClass = pos.direction === 'LONG' ? 'long' : 'short';
    const dangerClass = isCritical ? 'critical' : '';
    
    return `
        <div class="card ${typeClass} ${dangerClass}">
            <div class="card-header">
                <span class="coin">${pos.coin} ${pos.direction}</span>
                <span class="size">${formatCurrency(pos.positionUSD)}</span>
            </div>
            <div class="card-row">
                <span>Entry</span>
                <span>${pos.entryPrice}</span>
            </div>
            <div class="card-row">
                <span>Liq Price</span>
                <span style="color: ${isCritical ? '#ef4444' : ''}">${pos.liqPrice}</span>
            </div>
            <div class="card-row">
                <span>Distance</span>
                <span>${(pos.distanceToLiq * 100).toFixed(2)}%</span>
            </div>
            <div class="card-row">
                <span>Whale</span>
                <a href="${pos.hypurrscanUrl}" target="_blank" style="color: #3b82f6; text-decoration: none;">${pos.userShort}</a>
            </div>
        </div>
    `;
};

const renderNewPositionCard = (pos) => {
    const typeClass = pos.direction === 'LONG' ? 'long' : 'short';
    return `
        <div class="card ${typeClass}">
            <div class="card-header">
                <span class="coin">${pos.coin} ${pos.direction}</span>
                <span class="size">${formatCurrency(pos.positionUSD)}</span>
            </div>
            <div class="card-row">
                <span>Entry</span>
                <span>${pos.entryPrice}</span>
            </div>
            <div class="card-row">
                <span>Lev</span>
                <span>${pos.leverage}x</span>
            </div>
            <div class="card-row">
                <span>Time</span>
                <span>${formatDate(pos.timestamp)}</span>
            </div>
             <div class="card-row">
                <span>Whale</span>
                <a href="${pos.hypurrscanUrl}" target="_blank" style="color: #3b82f6; text-decoration: none;">${pos.userShort}</a>
            </div>
        </div>
    `;
};

const renderNotification = (notif) => {
    return `
        <div class="notification-item">
            <div class="time">${formatDate(notif.timestamp)}</div>
            <div style="white-space: pre-wrap;">${notif.message}</div>
        </div>
    `;
};

const updateDashboard = async () => {
    try {
        const [positionsRes, newPosRes, notifsRes, statsRes] = await Promise.all([
            fetch(`${API_URL}/positions`),
            fetch(`${API_URL}/new-positions`),
            fetch(`${API_URL}/sent-notifications`),
            fetch(`${API_URL}/stats`)
        ]);

        const positions = await positionsRes.json();
        const newPositions = await newPosRes.json();
        const notifications = await notifsRes.json();
        const stats = await statsRes.json();

        // Update Stats
        document.getElementById('stat-new').textContent = stats.newPositions;
        
        let criticalCount = 0;
        let warningCount = 0;

        // Render Positions
        const longsContainer = document.getElementById('longs-list');
        const shortsContainer = document.getElementById('shorts-list');
        longsContainer.innerHTML = '';
        shortsContainer.innerHTML = '';

        positions.forEach(pos => {
            if (pos.dangerLevel === 'CRITICAL') criticalCount++;
            else warningCount++;
            
            const html = renderPositionCard(pos);
            if (pos.direction === 'LONG') longsContainer.innerHTML += html;
            else shortsContainer.innerHTML += html;
        });

        document.getElementById('stat-critical').textContent = criticalCount;
        document.getElementById('stat-warning').textContent = warningCount;

        // Render New Positions
        const newPosContainer = document.getElementById('new-positions-list');
        newPosContainer.innerHTML = newPositions.map(renderNewPositionCard).join('');

        // Render Notifications
        const notifsContainer = document.getElementById('notifications-list');
        notifsContainer.innerHTML = notifications.map(renderNotification).join('');

    } catch (error) {
        console.error('Error updating dashboard:', error);
    }
};

// Poll every 5 seconds
setInterval(updateDashboard, 5000);
updateDashboard();
