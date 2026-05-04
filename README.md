# Kotoba Study

Kotoba Study is a full-stack Japanese learning application built in Google AI Studio. It leverages AI to provide deep linguistic analysis of Japanese text, helping learners understand structure, pronunciation, and vocabulary level effortlessly.

## 🚀 Features

- **AI Tokenization**: Uses Gemini 1.5 Pro to split complex Japanese into interactive tokens.
- **Pitch Accent Visualization**: Dynamic visual representations of Japanese pitch patterns (Heiban, Atamadaka, etc.).
- **OCR Support**: Upload screenshots of manga, news, or games to extract and study the text.
- **JLPT Tracking**: Highlighting and tagging of vocabulary based on JLPT difficulty levels.
- **Cloud Sync**: Save your study history and favorite words across sessions using Firebase.
- **Responsive Design**: Modern, dark-mode compatible UI built with Tailwind CSS.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Framer Motion.
- **Backend**: Node.js, Express.
- **Database/Auth**: Firebase (Firestore & Authentication).
- **AI**: Google Gemini API (@google/genai).

## 📦 Setup Instructions

### 1. Prerequisites
- **Node.js (v20+)**: Required for Tailwind Oxide engine and modern ESM support.
- **NVM (Recommended)**: To manage Node versions easily.
- **Google Gemini API Key**: [Get one here](https://aistudio.google.com/app/apikey).
- **OCR.space API Key**: [Get one here](https://ocr.space/ocrapi) (optional but recommended for image scanning).

### 2. Installation

1. **Clone the repository** (if applicable) and navigate to the folder.
2. **Install Node v20** (using NVM):
   ```bash
   nvm install 20
   nvm use 20
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```

### 3. Environment Variables (.env)
Create a `.env` file in the root directory. Copy the following variables and fill in your values:

```env
# Google Gemini API Config
GEMINI_API_KEY=your_gemini_api_key_here

# App URL (Use http://localhost:3000 for local dev)
VITE_APP_URL=http://localhost:3000

# OCR.space API Key
OCR_API_KEY=your_ocr_space_api_key_here
```

#### Where to get the keys:
- **GEMINI_API_KEY**: Login to [Google AI Studio](https://aistudio.google.com/), click on **"Get API key"** in the sidebar, and create a new API key. This is required for the core tokenization and AI analysis features.
- **VITE_APP_URL**: For local development, set this to `http://localhost:3000`. In production (like AI Studio), this variable is usually automatically handled or should be set to your public domain URL. It ensures the frontend can correctly locate the backend API routes.
  - *Example Local:* `VITE_APP_URL=http://localhost:3000`
  - *Example Production:* `VITE_APP_URL=https://myjapaneseapp.com`
- **OCR_API_KEY**: Register for a free API key at [OCR.space](https://ocr.space/ocrapi). Once registered, they will email you a key. This is required if you want to use the "Camera/OCR" feature to scan images.

### 4. Firebase Setup for Local Usage

To use Cloud Sync and Authentication locally:

1. **Create a Firebase Project**: Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2. **Enable Authentication**:
   - Go to **Build > Authentication**.
   - Click "Get Started" and enable **Google** as a Sign-in provider.
   - Add `localhost` to the Authorized Domains list (usually there by default).
3. **Enable Firestore Database**:
   - Go to **Build > Firestore Database**.
   - Click "Create Database".
   - Select **Production Mode** and choose a location.
   - **Important**: Deploy the security rules found in `firestore.rules` within this project to your Firebase Console under the "Rules" tab.
4. **Configure Local Client**:
   - Create a file named `firebase-applet-config.json` in the root directory.
   - Click the gear icon (Project Settings) > **General**.
   - Scroll down to "Your apps" and add a **Web App** (</>).
   - Copy the configuration object into `firebase-applet-config.json` in the following format:
     ```json
     {
       "apiKey": "...",
       "authDomain": "...",
       "projectId": "...",
       "storageBucket": "...",
       "messagingSenderId": "...",
       "appId": "...",
       "firestoreDatabaseId": "(default)"
     }
     ```

### 5. Running the Application

| Mode | Command | Description |
|------|---------|-------------|
| **Development** | `npm run dev` | Runs Express + Vite with HMR. Use this for building and testing. |
| **Production** | `npm run build && npm start` | Compiles assets and runs the optimized Express server. |

### 🚀 Hosting on AWS EC2 (Ubuntu)

Follow these steps to host Kotoba Study on a fresh Ubuntu instance:

#### 1. Server Preparation
- **Launch Instance**: Select **Ubuntu 22.04 LTS** or newer.
- **Security Group (Inbound Rules)**:
  - **Port 80 (HTTP)**: Allow from anywhere (0.0.0.0/0)
  - **Port 443 (HTTPS)**: Allow from anywhere (0.0.0.0/0)
  - **Port 22 (SSH)**: Allow from your IP
  - **Port 3000**: Optional (Allow if you want to bypass Nginx for testing)

#### 2. Install Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install NVM and Node.js 20
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20

# Install PM2 (Process Manager)
npm install -g pm2
```

#### 3. Setup Application
```bash
# Clone the repo (replace with your repo URL)
git clone https://github.com/yourusername/kotoba-study.git
cd kotoba-study

# Install and Build
npm install
npm run build
```

#### 4. Configure Environment
Create your `.env` and `firebase-applet-config.json` as described in the sections above. 
- **CRITICAL**: Set `VITE_APP_URL` to your domain or Public IP (e.g., `VITE_APP_URL=http://XX.XXX.XX.XX`).
- If using Nginx: Just the IP/Domain is enough.
- If NOT using Nginx: Include the port (e.g., `http://XX.XXX.XX.XX:3000`).

#### 5. Build for Production
This is required before starting the server in production mode:
```bash
npm run build
```

#### 6. Start with PM2
```bash
pm2 start server.ts --interpreter node --node-args="--import tsx" --name "kotoba-app"
pm2 save
pm2 startup
```

#### 7. Nginx Setup
To host your app professionally, create a dedicated Nginx configuration:

1. **Create the config file**:
   ```bash
   sudo nano /etc/nginx/sites-available/kotoba-app
   ```

2. **Paste this configuration**:
   *(Replace `XX.XXX.XX.XX` with your actual IP or Domain. Do NOT include `http://` in the `server_name` line.)*
   ```nginx
   server {
       listen 80;
       server_name XX.XXX.XX.XX;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           
           # Long timeouts to prevent "Took too long to respond"
           proxy_read_timeout 300;
           proxy_connect_timeout 300;
           proxy_send_timeout 300;
       }
   }
   ```

3. **Enable the site and restart**:
   ```bash
   # Link the config to enable it
   sudo ln -s /etc/nginx/sites-available/kotoba-app /etc/nginx/sites-enabled/

   # (Optional) Disable the default Nginx page
   sudo rm /etc/nginx/sites-enabled/default

   # Test the configuration
   sudo nginx -t

   # Restart Nginx
   sudo systemctl restart nginx
   ```

### 🚀 Hosting on Vercel

This app is configured to run as a full-stack application on Vercel using Serverless Functions for the backend and static hosting for the frontend.

1. **Connect to GitHub**: Push your code to a GitHub repository.
2. **Import to Vercel**: 
   - Create a new project on Vercel and import your repository.
   - Vercel will automatically detect the `vercel.json` configuration.
3. **Environment Variables**:
   - Go to **Project Settings > Environment Variables**.
   - Add `OCR_API_KEY` (Your API key from ocr.space).
   - Add `GEMINI_API_KEY` (If using AI features).
   - Add `VITE_APP_URL` (Set this to your Vercel deployment URL, e.g., `https://your-app.vercel.app`).
4. **Deploy**: Click deploy. Vercel will build the frontend and set up the API routes.

#### Why Vercel?
- **Global CDN**: Faster asset delivery.
- **Serverless API**: Your Express backend runs as a scalable serverless function.
- **Automatic SSL**: HTTPS is handled out of the box.

### 🛠️ Troubleshooting

#### 1. AWS/Cloud Security Group (CRITICAL)
If you can access `localhost:3000` inside your terminal (e.g., via `curl`) but NOT from your browser:
**This is not an app error, it is a cloud configuration error.**

1. Go to your **AWS EC2 Console** (or your provider's dashboard).
2. Find the **Security Group** attached to your instance.
3. Edit **Inbound Rules**:
   - **Type**: HTTP | **Port**: 80 | **Source**: `0.0.0.0/0`
   - **Type**: Custom TCP | **Port**: 3000 | **Source**: `0.0.0.0/0` (Needed for testing if NOT using Nginx)
   - **Type**: SSH | **Port**: 22 | **Source**: `Your IP`

#### 2. Understanding the `.env` IP
The `VITE_APP_URL` in your `.env` file **does not change where the app runs**. 
- The server ALWAYS runs on `0.0.0.0:3000` (all available IPs).
- `VITE_APP_URL` just tells your **browser** where to send requests.
- If you use Nginx, set it to: `VITE_APP_URL=http://XX.XXX.XX.XX`
- If you DON'T use Nginx, set it to: `VITE_APP_URL=http://XX.XXX.XX.XX:3000`

#### 3. Ubuntu Firewall (ufw)
Since you mentioned `ufw` is inactive, this step is likely fine, but double check:
```bash
# If it was active, you would need:
sudo ufw allow 80/tcp
sudo ufw allow 3000/tcp
```

#### 4. Nginx Setup
Make sure you have actually **enabled** the site. Nginx only reads files from `sites-enabled`, not `sites-available`.
```bash
# Link the config to enable it
sudo ln -s /etc/nginx/sites-available/kotoba-app /etc/nginx/sites-enabled/

# Test the config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

3. **Nginx Checker**:
   Verify Nginx is actually running and listening:
   ```bash
   sudo systemctl status nginx
   # If it says "active (running)", check logs:
   sudo tail -f /var/log/nginx/error.log
   ```

#### 504 Gateway Timeout (Takes too long)
This usually means the Node.js server crashed or is taking too long to process.
1. Check PM2 logs: `pm2 logs kotoba-app`.
2. Ensure you ran `npm run build` so Nginx can find the files (or Express can serve them).
3. Increase Nginx timeouts (instructions in Step 7).

#### OCR "No file uploaded" error
Ensure your `.env` file on the server has the correct `OCR_API_KEY`.
Check PM2 logs to see if the server received the file.

- **Permission Denied**: If binaries fail to run on Linux, try `chmod -R +x node_modules/.bin`.
- **ERR_INVALID_URL_SCHEME**: This is fixed in the current scripts by using `node --import tsx server.ts`.
- **Native Binding Error**: Ensure you are on Node 20. If it still fails, manually install the binding: `npm install @tailwindcss/oxide-linux-x64-gnu`.


## 📄 License
This project is built for educational purposes within the Google AI Studio environment.
