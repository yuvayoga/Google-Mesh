/************* GLOBAL *************/
const HIDE_DELAY = 30 * 1000;

let markers = {};
let lastSeenTime = 0;
let alertCircle = null;
let alertAnim = null;
let analyzingKeys = new Set(); // Track keys being analyzed
let map;

/************* FIREBASE *************/
firebase.initializeApp(FIREBASE_CONFIG);

const db = firebase.database();
const auth = firebase.auth();
const sosRef = db.ref("sos_messages");

/************* AUTHORIZATION *************/
// AUTHORIZED_EMAILS is now loaded from config.js

/************* AUTHENTICATION *************/
auth.onAuthStateChanged(async user => {
    const loginOverlay = document.getElementById("loginOverlay");
    const mainDashboard = document.getElementById("mainDashboard");

    if (user) {
        // Check if user is authorized
        if (!AUTHORIZED_EMAILS.includes(user.email)) {
            console.error("Unauthorized access attempt:", user.email);
            showError("Access Denied: You are not authorized to access the Control Room.");
            await auth.signOut();
            return;
        }

        console.log("User authenticated and authorized:", user.email);
        loginOverlay.style.display = "none";
        mainDashboard.style.display = "block";

        // Initialize map and listeners only once
        if (!map) {
            initMap();
        }
    } else {
        console.log("User signed out");
        loginOverlay.style.display = "flex";
        mainDashboard.style.display = "none";

        // Cleanup if needed
        if (map) {
            map.remove();
            map = null;
        }
    }
});

async function handleLogin() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const errorMsg = document.getElementById("loginError");
    const btnText = document.getElementById("loginBtnText");
    const loader = document.getElementById("loginLoader");

    if (!email || !password) {
        showError("Please enter both email and password.");
        return;
    }

    // UI Feedback
    btnText.style.display = "none";
    loader.style.display = "inline-block";
    errorMsg.style.display = "none";

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        console.error("Login Error:", error);
        showError(error.message);
    } finally {
        btnText.style.display = "inline-block";
        loader.style.display = "none";
    }
}

function handleLogout() {
    if (confirm("Are you sure you want to logout?")) {
        auth.signOut();
    }
}

function showError(msg) {
    const errorMsg = document.getElementById("loginError");
    errorMsg.innerText = msg;
    errorMsg.style.display = "block";
}

/************* CONNECTION MONITOR *************/
db.ref(".info/connected").on("value", (snap) => {
    const statusDot = document.getElementById("connectionStatus");
    if (snap.val() === true) {
        console.log("Connected to Firebase");
        if (statusDot) {
            statusDot.style.backgroundColor = "#16a34a"; // Green
            statusDot.style.boxShadow = "0 0 5px #16a34a";
            statusDot.title = "Connected";
        }
    } else {
        console.log("Disconnected from Firebase");
        if (statusDot) {
            statusDot.style.backgroundColor = "#ef4444"; // Red
            statusDot.style.boxShadow = "0 0 5px #ef4444";
            statusDot.title = "Disconnected";
        }
    }
});

/************* MAP (LEAFLET) *************/
function initMap() {
    // Initialize Leaflet map
    map = L.map('map').setView([9.9252, 78.1198], 13);

    // Add OpenStreetMap tiles (Free)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Start listening to SOS messages after map is ready
    listenToSOS();
}

/************* TAB SWITCH *************/
function showTab(type) {
    document.getElementById("activeView").style.display =
        type === "active" ? "block" : "none";
    document.getElementById("archiveView").style.display =
        type === "archive" ? "block" : "none";

    document.getElementById("tabActive").classList.toggle("active-tab", type === "active");
    document.getElementById("tabArchive").classList.toggle("active-tab", type === "archive");
}

/************* 🔔 ALERT SOUND *************/
function playSosAlert() {
    const src = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
    const beep = () => {
        const a = new Audio(src);
        a.volume = 0.9;
        a.play().catch(() => { });
    };

    beep(); setTimeout(beep, 150); setTimeout(beep, 300);
    setTimeout(beep, 550); setTimeout(beep, 700); setTimeout(beep, 850);
}

/************* 🔴 ALERT ZONE *************/
function showAlertZone(lat, lon, color = "#dc2626") {
    clearAlertZone();

    let baseRadius = 250;
    let grow = true;

    alertCircle = L.circle([lat, lon], {
        color: color,
        fillColor: color,
        fillOpacity: 0.28,
        radius: baseRadius,
        weight: 2
    }).addTo(map);

    alertAnim = setInterval(() => {
        if (!alertCircle) return;

        let r = alertCircle.getRadius();
        r = grow ? r + 30 : r - 30;

        if (r >= baseRadius + 90) grow = false;
        if (r <= baseRadius) grow = true;

        alertCircle.setRadius(r);
        alertCircle.setStyle({ fillOpacity: grow ? 0.35 : 0.2 });
    }, 180);
}

function clearAlertZone() {
    if (alertAnim) {
        clearInterval(alertAnim);
        alertAnim = null;
    }
    if (alertCircle) {
        if (map) map.removeLayer(alertCircle);
        alertCircle = null;
    }
}

/************* ICONS & MARKERS *************/
function getMarkerOptions(priority, status) {
    if (status === "Rescued") {
        return {
            radius: 8,
            fillColor: '#16a34a',
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 1
        };
    }

    const color = priority === 'Critical' ? '#ef4444' : priority === 'High' ? '#f97316' : '#3b82f6';
    return {
        radius: 10,
        fillColor: color,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 1
    };
}

/************* MAIN LISTENER *************/
function listenToSOS() {
    sosRef.on("value", snap => {
        const activeList = document.getElementById("sosList");
        const archiveList = document.getElementById("archiveList");

        activeList.innerHTML = "";
        archiveList.innerHTML = "";

        let pending = 0, rescued = 0, newestKey = null;

        snap.forEach(c => {
            if (c.val().time > lastSeenTime) {
                lastSeenTime = c.val().time;
                newestKey = c.key;
            }
        });

        snap.forEach(child => {
            const d = child.val();
            const k = child.key;
            const ai = d.ai_analysis || {};

            if (markers[k]) {
                if (map) map.removeLayer(markers[k]);
                delete markers[k];
            }

            if (d.status !== "Rescued") {
                pending++;

                const marker = L.circleMarker([d.lat, d.lon], getMarkerOptions(ai.priority, d.status))
                    .addTo(map)
                    .bindPopup(popupHTML(d, k));

                markers[k] = marker;

                const card = document.createElement("div");
                card.className = "sos-item";
                card.onclick = () => {
                    map.panTo([d.lat, d.lon]);
                    map.setZoom(16);
                    marker.openPopup();
                };

                const priorityColor = ai.priority === 'Critical' ? '#ef4444' : ai.priority === 'High' ? '#f97316' : '#3b82f6';

                card.innerHTML = `
            <div class="device">${d.deviceId}</div>
            <div class="time">${new Date(d.time).toLocaleString()}</div>
            <div style="font-size:12px; color:#cbd5e1; margin-top:4px;">${d.message || 'Emergency SOS'}</div>
            ${ai.priority ? `<div style="font-size:10px; font-weight:bold; color:${priorityColor}; margin-top:4px; text-transform:uppercase;">${ai.priority} PRIORITY</div>` : ''}
            <div class="status-pending">Pending</div>
          `;
                activeList.appendChild(card);

            } else {
                rescued++;

                const archived = document.createElement("div");
                archived.className = "sos-item";
                archived.onclick = () => {
                    clearAlertZone();
                    const marker = L.circleMarker([d.lat, d.lon], getMarkerOptions(null, "Rescued"))
                        .addTo(map)
                        .bindPopup(`<b>Status:</b> <span style="color:#16a34a">Rescued</span>`);

                    markers[k] = marker;
                    map.panTo([d.lat, d.lon]);
                    map.setZoom(15);
                    marker.openPopup();
                };

                archived.innerHTML = `
            <div class="device">${d.deviceId}</div>
            <div class="time">${new Date(d.time).toLocaleString()}</div>
            <div class="status-rescued">Rescued</div>
          `;
                archiveList.appendChild(archived);
            }
        });

        /************* NEW SOS FLOW *************/
        if (newestKey && markers[newestKey]) {
            const d = snap.child(newestKey).val();

            // AI ANALYSIS
            if (!d.ai_analysis && d.status !== 'Rescued' && !analyzingKeys.has(newestKey)) {
                console.log("Analyzing SOS with Gemini...");
                analyzingKeys.add(newestKey);

                analyzeSOSWithGemini(d).then(analysis => {
                    if (analysis) {
                        sosRef.child(newestKey).update({ ai_analysis: analysis });
                    } else {
                        const msg = (d.message || "").toLowerCase();
                        let fallbackPriority = 'Medium';
                        let fallbackScore = 5;
                        let fallbackAction = 'Review manually';

                        if (msg.includes('fire') || msg.includes('blood') || msg.includes('critical') || msg.includes('help') || msg.includes('emergency')) {
                            fallbackPriority = 'Critical';
                            fallbackScore = 9;
                            fallbackAction = 'IMMEDIATE ACTION REQUIRED (Keyword Detected)';
                        } else if (msg.includes('hurt') || msg.includes('pain') || msg.includes('lost')) {
                            fallbackPriority = 'High';
                            fallbackScore = 7;
                            fallbackAction = 'Dispatch assistance';
                        }

                        sosRef.child(newestKey).update({
                            ai_analysis: {
                                priority: fallbackPriority,
                                score: fallbackScore,
                                summary: `AI Unavailable. Detected keywords in: "${d.message}"`,
                                action: fallbackAction
                            }
                        });
                    }
                    analyzingKeys.delete(newestKey);
                }).catch(() => {
                    analyzingKeys.delete(newestKey);
                });
            }

            playSosAlert();

            setTimeout(() => {
                if (markers[newestKey]) markers[newestKey].openPopup();
            }, 200);

            setTimeout(() => {
                map.panTo([d.lat, d.lon]);
                map.setZoom(16);
            }, 1200);

            setTimeout(() => {
                const ai = d.ai_analysis || {};
                const color = ai.priority === 'Critical' ? '#dc2626' : ai.priority === 'High' ? '#f97316' : '#3b82f6';
                showAlertZone(d.lat, d.lon, color);
            }, 2500);
        }

        document.getElementById("pending").innerText = pending;
        document.getElementById("rescued").innerText = rescued;
    });
}

/************* POPUP *************/
function popupHTML(d, k) {
    const ai = d.ai_analysis || {};
    const priorityColor = ai.priority === 'Critical' ? '#ef4444' : ai.priority === 'High' ? '#f97316' : '#3b82f6';

    return `
    <div style="margin-bottom:8px; min-width: 200px; color: #333;">
      <b style="font-size:14px; color:#1e293b">${d.userName || d.deviceId}</b>
      <div style="font-size:12px; color:#475569; margin-top:4px;">${d.message || 'Emergency SOS'}</div>
      
      ${ai.priority ? `
      <div style="margin-top:8px; padding:8px; background:#f1f5f9; border-radius:6px; border-left:3px solid ${priorityColor}">
        <div style="font-size:11px; font-weight:bold; color:${priorityColor}; text-transform:uppercase;">
            ${ai.priority} PRIORITY (Score: ${ai.score}/10)
        </div>
        <div style="font-size:11px; color:#475569; margin-top:2px;">${ai.summary}</div>
        <div style="font-size:11px; color:#1e293b; margin-top:4px;"><b>Action:</b> ${ai.action}</div>
      </div>
      ` : ''}

    </div>
    <div style="display:flex; gap:8px; margin-top:8px">
      <button onclick="openChat('${d.deviceId}', '${d.userName || d.deviceId}')" 
        style="background:#2563eb; color:white; flex:1; display:flex; align-items:center; justify-content:center; gap:6px; border:none; border-radius:6px; padding:8px; cursor:pointer; font-weight:600;">
        <span>💬</span> Chat
      </button>
      <button onclick="markRescued('${k}')" 
        style="background:#cbd5e1; color:#475569; width:auto; padding:8px; border:none; border-radius:6px; cursor:pointer;">
        ✓
      </button>
    </div>
  `;
}

/************* CHAT LOGIC *************/
let activeChatDeviceId = null;
let chatListener = null;

window.openChat = function (deviceId, userName) {
    activeChatDeviceId = deviceId;
    const panel = document.getElementById("chatPanel");
    panel.style.display = "flex";
    document.getElementById("chatTitle").innerText = userName;
    document.getElementById("chatSubtitle").innerText = `Device: ${deviceId}`;

    const chatMessages = document.getElementById("chatMessages");
    chatMessages.innerHTML = "";

    // Unsubscribe previous
    if (chatListener) {
        db.ref(`chats/${deviceId}`).off("value", chatListener);
    }

    // Listen for messages
    chatListener = db.ref(`chats/${deviceId}`).on("value", snap => {
        chatMessages.innerHTML = "";
        const data = snap.val();
        if (data) {
            Object.values(data).sort((a, b) => a.time - b.time).forEach(msg => {
                const div = document.createElement("div");
                div.className = `msg ${msg.sender === 'user' ? 'msg-user' : 'msg-base'}`;
                div.innerText = msg.text;
                chatMessages.appendChild(div);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    });
}

window.closeChat = function () {
    document.getElementById("chatPanel").style.display = "none";
    if (activeChatDeviceId && chatListener) {
        db.ref(`chats/${activeChatDeviceId}`).off("value", chatListener);
    }
    activeChatDeviceId = null;
}

window.sendChatMessage = function () {
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text || !activeChatDeviceId) return;

    db.ref(`chats/${activeChatDeviceId}`).push({
        text: text,
        sender: 'base',
        time: Date.now()
    });

    input.value = "";
}

window.handleChatKey = function (e) {
    if (e.key === "Enter") sendChatMessage();
}

/************* ACTION *************/
function markRescued(k) {
    clearAlertZone();

    if (markers[k]) {
        if (map) map.removeLayer(markers[k]);
        delete markers[k];
    }

    sosRef.child(k).update({
        status: "Rescued",
        rescuedAt: Date.now()
    });
}
