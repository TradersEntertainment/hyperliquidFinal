# 🚀 Hyperliquid Tracker Bot - Deployment Guide

This guide will help you deploy your bot to a cloud server (VPS) so it can run 24/7 without your computer being on.

## 1. Choose a VPS Provider
You need a small Linux server. Any of these will work perfectly (cheapest options are fine):
- **Hetzner** (Cheapest, highly recommended) - ~€5/month
- **DigitalOcean** (Droplet) - ~$6/month
- **Vultr** or **Linode**

**Recommended OS:** Ubuntu 22.04 LTS

## 2. Connect to Your Server
After buying, you will get an IP address and password.
Open your terminal (or Putty on Windows) and run:
```bash
ssh root@YOUR_SERVER_IP
```

## 3. Install Node.js
Run these commands one by one to install Node.js 18+:
```bash
sudo apt update
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```
Verify installation:
```bash
node -v
npm -v
```

## 4. Upload Your Code
You have two options:

### Option A: Git (Recommended)
1. Push your code to a private GitHub repository.
2. Clone it on the server:
```bash
git clone https://github.com/YOUR_USERNAME/hyperliquid-tracker.git
cd hyperliquid-tracker
npm install
```

### Option B: SCP (Direct Copy)
If you don't want to use Git, you can copy files from your PC to the server.
Run this **on your local PC** (not the server):
```bash
scp -r C:\Users\omery\.gemini\antigravity\scratch\hyperliquid-tracker root@YOUR_SERVER_IP:/root/
```

## 5. Configure Environment
Create the `.env` file on the server:
```bash
nano .env
```
Paste your `.env` content (API keys, etc.) here.
Press `Ctrl+X`, then `Y`, then `Enter` to save.

## 6. Run with PM2 (Process Manager)
PM2 keeps your bot running forever. If it crashes or the server restarts, PM2 brings it back.

Install PM2:
```bash
sudo npm install -g pm2
```

Start the bot:
```bash
pm2 start server.js --name "hyperliquid-bot"
```

Save the list so it starts on boot:
```bash
pm2 save
pm2 startup
```
(Copy and run the command PM2 gives you after `pm2 startup`)

## 7. Useful Commands
- **View Logs:** `pm2 logs hyperliquid-bot` (To see whales appearing!)
- **Restart:** `pm2 restart hyperliquid-bot`
- **Stop:** `pm2 stop hyperliquid-bot`
- **Monitor:** `pm2 monit`

## 8. Persistence (Important)
Your bot now saves its memory (tracked whales, alerts) to `data.json`.
- **VPS (DigitalOcean, Hetzner):** Works perfectly. The file stays there forever.
- **Railway / Heroku:** ⚠️ **WARNING**. These platforms wipe files when the bot restarts. If you use them, you will lose your memory every time. **Stick to a VPS** (Option 1) for this bot.

## 8. (Optional) Domain & SSL
If you want to access the dashboard via a domain (e.g., `bot.omery.com`), you'll need Nginx.
1. Install Nginx: `sudo apt install nginx`
2. Configure it to proxy pass to port 3000.
3. Use Certbot for HTTPS.

---
**🎉 Done! Your bot is now hunting whales 24/7 in the cloud.**
