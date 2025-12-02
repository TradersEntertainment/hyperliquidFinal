# 🚂 Deploying to Railway (The Easy Way)

This guide will show you how to deploy your bot to Railway.app. Railway is much easier to manage than a raw VPS.

## Prerequisites
- A GitHub account.
- Your code pushed to a GitHub repository.

## Step 1: Create the Project on Railway
1. Go to [Railway.app](https://railway.app/) and log in with GitHub.
2. Click **"New Project"** -> **"Deploy from GitHub repo"**.
3. Select your `hyperliquid-tracker` repository.
4. Click **"Deploy Now"**.

## Step 2: Set Environment Variables
Your bot needs your API keys to work.
1. Go to your project dashboard in Railway.
2. Click on the **"Variables"** tab.
3. Add all the variables from your local `.env` file:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `TWITTER_API_KEY`, `TWITTER_API_SECRET`, etc.
   - `PORT` (Set this to `3000` or let Railway assign one, but `3000` is safe).

## Step 3: Set Up Persistent Storage (Critical!)
Railway deletes files when the bot restarts. To keep your "memory" (`data.json`), we need a **Volume**.

1. In your Railway project view, right-click on the empty background area (or click "New") and select **"Volume"**.
2. Connect the Volume to your service (drag a line from the Volume to your bot service).
3. Click on the Volume to configure it.
   - **Mount Path**: `/app/data` (This is a folder inside the bot where we will store files).
4. Go back to your **Service Variables**.
5. Add a NEW variable:
   - **Variable Name**: `DATA_FILE_PATH`
   - **Value**: `/app/data/data.json`

> **Why?** This tells the bot: "Don't save memory in the temporary folder. Save it in the permanent Volume folder at `/app/data/`."

## Step 4: Deploy & Verify
1. Railway usually redeploys automatically when you change variables. If not, click **"Redeploy"**.
2. Click on your service and look at the **"Deploy Logs"**.
3. You should see:
   ```
   🚀 Starting HL Liquidation Hunter...
   ✅ Loaded configuration
   💾 State loaded from disk. (Or "Error loading state" if it's the first time, which is fine)
   ```

## Troubleshooting
- **Bot crashes immediately?** Check your Environment Variables. Did you copy the keys correctly?
- **"Error: EACCES: permission denied"?** Make sure your Volume Mount Path is exactly `/app/data` and your `DATA_FILE_PATH` is `/app/data/data.json`.

---
**🎉 Done! Your bot is now live on Railway.**
