---
description: How to set up a new project for APK build from scratch
---

Follow these steps to create a new project and prepare it for APK generation:

### 1. Create a New Project
Run this in your terminal to create a new React project:
```powershell
npm create vite@latest my-new-app -- --template react
cd my-new-app
npm install
```

### 2. Add Mobile-Ready Features (PWA)
1. Create a `manifest.json` in the `public` folder.
2. Add a `sw.js` (Service Worker) in the `public` folder.
3. Link them in your `index.html`.

### 3. Add Capacitor (for APK)
Run these commands to add the Android build system:
```powershell
# Install Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android

# Initialize Capacitor (Follow the prompts)
npx cap init "My App Name" com.example.app --web-dir dist

# Add the Android platform
npx cap add android
```

### 4. Configure Build Scripts
Add these to your `package.json` under `"scripts"`:
```json
"sync": "npx cap sync",
"build:apk": "npm run build && npx cap sync && cd android && ./gradlew assembleDebug"
```

### 5. Build Your APK
Whenever you want to build the APK, just run:
```powershell
npm run build:apk
```

// turbo-all
### 6. Verify Build
The APK will be generated at:
`my-new-app/android/app/build/outputs/apk/debug/app-debug.apk`
