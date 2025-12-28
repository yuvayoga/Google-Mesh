# Google Mesh - Offline Emergency Response System

Google Mesh is a robust, dual-application system designed for emergency communication in environments with zero or limited internet connectivity. It leverages mesh networking to relay SOS signals and uses Gemini AI to analyze emergencies for faster response.

## 🚀 Components

### 1. Mobile App (`/mobile-app`)
A React-based PWA/Mobile application for users in distress.
- **Offline SOS:** Send emergency signals without an active internet connection.
- **Mesh Relay:** Automatically relay signals from other nearby devices to the cloud once a connection is found.
- **Nearby Alerts:** Receive notifications if someone nearby is in danger.
- **Secure Auth:** Firebase-backed login and signup with email verification.

### 2. Base Station (`/base-station`)
A control room dashboard for emergency responders.
- **Live Map:** Real-time visualization of SOS signals using Leaflet and OpenStreetMap.
- **AI Analysis:** Automatic prioritization and summary of emergencies using Gemini 1.5 Flash.
- **Direct Chat:** Communicate with users in distress via a built-in chat interface.
- **Authorized Access:** Restricted access to approved responder emails.

## 🛠️ Setup Instructions

### Prerequisites
- Node.js installed.
- A Firebase project with Realtime Database and Authentication enabled.
- A Google AI (Gemini) API key.

### Base Station Setup
1. Navigate to `/base-station`.
2. Create a `config.js` file (this is ignored by Git).
3. Add your credentials:
   ```javascript
   const FIREBASE_CONFIG = {
       apiKey: "YOUR_API_KEY",
       authDomain: "YOUR_PROJECT.firebaseapp.com",
       databaseURL: "https://YOUR_PROJECT.firebaseio.com",
       projectId: "YOUR_PROJECT",
       storageBucket: "YOUR_PROJECT.appspot.com",
       messagingSenderId: "YOUR_ID",
       appId: "YOUR_APP_ID"
   };

   const AUTHORIZED_EMAILS = ["admin@example.com"];
   const GEMINI_API_KEY = "YOUR_GEMINI_KEY";
   ```
4. Open `index.html` in a browser or serve via `npx serve`.

### Mobile App Setup
1. Navigate to `/mobile-app`.
2. Create a `.env` file (this is ignored by Git).
3. Add your environment variables:
   ```env
   VITE_FIREBASE_API_KEY=YOUR_API_KEY
   VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
   VITE_FIREBASE_DATABASE_URL=https://YOUR_PROJECT.firebaseio.com
   VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT
   VITE_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_ID
   VITE_FIREBASE_APP_ID=YOUR_APP_ID
   VITE_GEMINI_API_KEY=YOUR_GEMINI_KEY
   ```
4. Run `npm install` and `npm run dev`.

## 🔒 Security
Sensitive information like API keys and responder emails are stored in `config.js` and `.env` files, which are explicitly excluded from GitHub via `.gitignore`.

## 📄 License
This project is developed for emergency response and safety purposes.
