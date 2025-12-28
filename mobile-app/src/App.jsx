import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, MapPin, Smartphone, CheckCircle2, AlertTriangle, Wifi, WifiOff, MessageSquare, User, Radio, Sun, Moon, Share2, CloudOff, CloudUpload, Mail, RotateCw } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, set, onValue } from 'firebase/database';
import { getAuth, onAuthStateChanged, sendEmailVerification } from 'firebase/auth';
import { Geolocation } from '@capacitor/geolocation';
import { BleClient } from '@capacitor-community/bluetooth-le';

// Services
import NearbyConnectionsService from './services/NearbyConnectionsService';
import OfflineStorageService from './services/OfflineStorageService';
import SyncManager from './services/SyncManager';

// Components
import Profile from './components/Profile';
import Messages from './components/Messages';
import Login from './components/Login';
import Signup from './components/Signup';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
export const auth = getAuth(app);

function App() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authView, setAuthView] = useState('login'); // 'login' or 'signup'
  const [activeTab, setActiveTab] = useState('sos');
  const [location, setLocation] = useState({ lat: null, lon: null, error: null });
  const [status, setStatus] = useState('idle');
  const [deviceId] = useState(() => `GOS-${Math.random().toString(36).substr(2, 6).toUpperCase()}`);
  const [online, setOnline] = useState(navigator.onLine);
  const [theme, setTheme] = useState(() => localStorage.getItem('google_sos_theme') || 'light');
  const [meshRelayActive, setMeshRelayActive] = useState(false);
  const [shareStatus, setShareStatus] = useState('idle');
  const [nearbyEmergency, setNearbyEmergency] = useState(null);
  const [syncStatus, setSyncStatus] = useState({ syncing: false, pending: 0 });
  const [sosMessage, setSosMessage] = useState('');
  const [permissionsGranted, setPermissionsGranted] = useState({ location: false, bluetooth: false });
  const [locationServiceEnabled, setLocationServiceEnabled] = useState(false);
  const [showPermissionOverlay, setShowPermissionOverlay] = useState(true);


  // Service refs
  const nearbyService = useRef(null);
  const offlineStorage = useRef(null);
  const syncManager = useRef(null);

  // Listen for Auth State Changes (Real-time)
  useEffect(() => {
    let profileUnsubscribe = null;
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          emailVerified: firebaseUser.emailVerified
        };
        setUser(userData);
        localStorage.setItem('sos_current_user', JSON.stringify(userData));

        // Fetch full profile from RTDB
        const profileRef = ref(db, `users/${firebaseUser.uid}`);
        profileUnsubscribe = onValue(profileRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            setUserProfile(data);
            localStorage.setItem('sos_user_profile', JSON.stringify(data));
          }
        });

        // Proactively request permissions after login
        checkPermissions();
      } else {
        if (profileUnsubscribe) profileUnsubscribe();
        setUser(null);
        setUserProfile(null);
        localStorage.removeItem('sos_current_user');
        localStorage.removeItem('sos_user_profile');
      }
    });
    return () => {
      unsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  // Initialize services
  useEffect(() => {
    if (!user) return; // Only init services if logged in

    // Initialize services
    nearbyService.current = new NearbyConnectionsService(deviceId);
    offlineStorage.current = new OfflineStorageService();
    syncManager.current = new SyncManager(db, offlineStorage.current);

    // Listen for mesh messages
    const unsubscribe = nearbyService.current.onMessage(handleMeshMessage);

    // Listen for sync events
    const unsubscribeSync = syncManager.current.onSyncEvent(handleSyncEvent);

    // Update storage stats
    updateStorageStats();

    return () => {
      unsubscribe();
      unsubscribeSync();
      nearbyService.current?.destroy();
      offlineStorage.current?.destroy();
      syncManager.current?.destroy();
    };
  }, [deviceId, user]);

  const handleLogin = (userData) => {
    // Handled by onAuthStateChanged
  };

  const handleSignup = (userData) => {
    // Handled by onAuthStateChanged
  };

  const handleLogout = async () => {
    await auth.signOut();
    setUser(null);
    setAuthView('login');
  };

  const checkVerification = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        // Update local state to reflect verification
        const updatedUser = { ...user, emailVerified: true };
        setUser(updatedUser);
        localStorage.setItem('sos_current_user', JSON.stringify(updatedUser));
        alert("Email Verified! Welcome.");
      } else {
        alert("Email not verified yet. Please check your inbox.");
      }
    }
  };

  const resendVerification = async () => {
    if (auth.currentUser) {
      try {
        await sendEmailVerification(auth.currentUser);
        alert(`Verification email sent to ${user.email}`);
      } catch (e) {
        alert("Error sending email: " + e.message);
      }
    }
  };

  const handleMeshMessage = async ({ type, payload, hops, senderId }) => {
    if (type === 'SOS_BROADCAST') {
      // Check if nearby emergency
      if (location.lat && location.lon) {
        const dist = getDistance(location.lat, location.lon, payload.lat, payload.lon);
        if (dist <= 100) {
          setNearbyEmergency({ ...payload, distance: dist, hops });
          setTimeout(() => setNearbyEmergency(null), 30000);
        }
      }

      // If we're online and sender was offline, relay to cloud
      if (online && !payload.alreadyUploaded) {
        setMeshRelayActive(true);
        try {
          const msgId = `${payload.deviceId}-${payload.time}`;
          await set(ref(db, `sos_messages/${msgId}`), {
            ...payload,
            relayedBy: deviceId,
            relayTime: Date.now(),
            hops
          });
          console.log('[App] Relayed SOS to cloud');
        } catch (err) {
          console.error('[App] Cloud relay failed:', err);
        }
        setTimeout(() => setMeshRelayActive(false), 3000);
      } else if (!online) {
        // Store for later sync
        await offlineStorage.current.storeMessage({
          type,
          payload,
          messageId: `${payload.deviceId}-${payload.time}`
        });
        updateStorageStats();
      }
    }
  };

  const handleSyncEvent = (event) => {
    if (event.type === 'sync_start') {
      setSyncStatus(prev => ({ ...prev, syncing: true }));
    } else if (event.type === 'sync_complete') {
      setSyncStatus({ syncing: false, pending: 0 });
      updateStorageStats();
    } else if (event.type === 'online') {
      setOnline(true);
    } else if (event.type === 'offline') {
      setOnline(false);
    }
  };

  const updateStorageStats = async () => {
    if (offlineStorage.current) {
      const stats = await offlineStorage.current.getStats();
      setSyncStatus(prev => ({ ...prev, pending: stats.pendingCount }));
    }
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const shareApp = async () => {
    const shareData = { title: 'Google Mesh', text: 'Offline Emergency Response System', url: window.location.origin };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (err) { console.log('Share failed:', err); }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.origin);
        setShareStatus('copied');
        setTimeout(() => setShareStatus('idle'), 2000);
      } catch (err) { console.error('Copy failed:', err); }
    }
  };

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('google_sos_theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [geoStatus, setGeoStatus] = useState('initializing'); // 'initializing', 'requesting', 'denied', 'unavailable', 'active'

  const checkPermissions = async () => {
    try {
      console.log('[Permissions] Starting check...');

      // 1. Check Location Permission First
      const geoPerms = await Geolocation.checkPermissions();
      const locGranted = geoPerms.location === 'granted';
      console.log('[Permissions] Location Granted:', locGranted);

      // 2. Check Location Service (GPS)
      let locServiceOn = false;

      if (window.cordova && window.cordova.plugins && window.cordova.plugins.diagnostic) {
        try {
          // Diagnostic plugin is the most reliable way to check if GPS is enabled
          locServiceOn = await new Promise((resolve) => {
            window.cordova.plugins.diagnostic.isLocationEnabled(
              (enabled) => resolve(enabled),
              (error) => {
                console.warn('[Location] Diagnostic check failed:', error);
                resolve(false);
              }
            );
          });
          console.log('[Location] Diagnostic check -> locServiceOn:', locServiceOn);
        } catch (e) {
          console.warn('[Location] Diagnostic exception:', e);
          locServiceOn = false;
        }
      } else {
        // Fallback for browser/dev
        console.warn('[Location] Diagnostic plugin missing, using fallback');
        try {
          await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 2000, maximumAge: 0 });
          locServiceOn = true;
        } catch {
          locServiceOn = false;
        }
      }

      // 3. Check Bluetooth Status
      let btReady = false;
      try {
        await BleClient.initialize();
        btReady = await BleClient.isEnabled();
        console.log('[Bluetooth] Ready:', btReady);
      } catch (e) {
        console.warn('[Bluetooth] Check failed:', e);
        btReady = false;
      }

      // 4. Update State
      setPermissionsGranted({ location: locGranted, bluetooth: btReady });
      setLocationServiceEnabled(locServiceOn);

      // 5. Overlay Logic
      if (!locServiceOn) {
        setShowPermissionOverlay(true);
      } else if (!locGranted) {
        setShowPermissionOverlay(true);
      } else if (!btReady) {
        setShowPermissionOverlay(true);
      } else {
        setShowPermissionOverlay(false);
      }

      // Start tracking if everything is good
      if (locServiceOn && locGranted) {
        startTracking();
      }

    } catch (e) {
      console.error('[Permissions] Critical check failed:', e);
      setShowPermissionOverlay(true);
    }
  };

  const enableLocation = async () => {
    try {
      // Use Location Accuracy Plugin to trigger system dialog
      if (window.cordova && window.cordova.plugins && window.cordova.plugins.locationAccuracy) {
        window.cordova.plugins.locationAccuracy.request(
          () => {
            console.log('Location accuracy request successful');
            // After success, re-check everything
            checkPermissions();
          },
          (error) => {
            console.error('Location accuracy request failed:', error);
            // If failed (e.g. user clicked No), we still re-check
            checkPermissions();
          },
          window.cordova.plugins.locationAccuracy.REQUEST_PRIORITY_HIGH_ACCURACY
        );
      } else {
        // Fallback
        await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        checkPermissions();
      }
    } catch (err) {
      console.error('Failed to enable location:', err);
      checkPermissions();
    }
  };

  const enableBluetooth = async () => {
    try {
      await BleClient.initialize();
      checkPermissions();
    } catch (err) {
      console.error('Failed to enable bluetooth:', err);
      checkPermissions();
    }
  };

  useEffect(() => {
    if (user) {
      checkPermissions();
    }
  }, [user]);

  // Listen for app resume to re-check permissions (e.g. user returns from settings)
  useEffect(() => {
    const handleResume = () => {
      console.log('[App] Resumed, re-checking permissions...');
      checkPermissions();
    };
    document.addEventListener('resume', handleResume);
    return () => document.removeEventListener('resume', handleResume);
  }, []);

  const startTracking = async () => {
    setGeoStatus('requesting');
    try {
      // We assume permissions are already granted by the overlay flow
      setGeoStatus('active');
      const watchId = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }, (pos, err) => {
        if (err) {
          setGeoStatus('unavailable');
          setLocation(prev => ({ ...prev, error: err.message }));
          return;
        }
        if (pos) {
          setGeoStatus('active');
          setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, error: null });
        }
      });
      return watchId;
    } catch (err) {
      setGeoStatus('unavailable');
      setLocation(prev => ({ ...prev, error: err.message }));
    }
  };

  useEffect(() => {
    if (!user) return;
    let watchIdPromise = startTracking();
    return () => {
      watchIdPromise.then(id => {
        if (id) Geolocation.clearWatch({ id });
      });
    };
  }, [user]);

  const sendSOS = async () => {
    if (status === 'sending') return;
    if (!location.lat || !location.lon) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }

    const payload = {
      deviceId,
      userName: user?.displayName || user?.fullName || deviceId || 'Unknown User',
      lat: location.lat,
      lon: location.lon,
      time: Date.now(),
      status: 'Pending',
      message: sosMessage || 'Emergency SOS',
      alreadyUploaded: false
    };

    const msgId = `${deviceId}-${payload.time}`;
    console.log('[SOS] Sending SOS:', msgId, payload);
    setStatus('sending');

    // Broadcast to mesh network
    nearbyService.current.broadcastSOS(payload);

    if (online) {
      // Upload directly to Firebase
      try {
        console.log('[SOS] Uploading to Firebase...');
        await set(ref(db, `sos_messages/${msgId}`), { ...payload, alreadyUploaded: true });
        console.log('[SOS] Upload successful!');
        setStatus('success');
        setSosMessage('');
        setTimeout(() => setStatus('idle'), 5000);
      } catch (err) {
        console.error('[SOS] Firebase upload failed:', err);
        // Store for later sync
        try {
          await offlineStorage.current.storeMessage({
            type: 'SOS_BROADCAST',
            payload,
            messageId: msgId
          });
          console.log('[SOS] Stored offline for later sync');
        } catch (storeErr) {
          console.error('[SOS] Offline storage also failed:', storeErr);
        }
        setStatus('success');
        setTimeout(() => setStatus('idle'), 5000);
        updateStorageStats();
      }
    } else {
      // Store for later sync
      console.log('[SOS] Offline mode, storing locally...');
      try {
        await offlineStorage.current.storeMessage({
          type: 'SOS_BROADCAST',
          payload,
          messageId: msgId
        });
        console.log('[SOS] Stored offline successfully');
      } catch (err) {
        console.error('[SOS] Offline storage failed:', err);
      }
      setStatus('success');
      setSosMessage('');
      setTimeout(() => setStatus('idle'), 5000);
      updateStorageStats();
    }
  };

  // AUTH VIEW
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 md-surface">
        <AnimatePresence mode="wait">
          {authView === 'login' ? (
            <motion.div key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="w-full flex justify-center">
              <Login auth={auth} onLogin={handleLogin} onSwitchToSignup={() => setAuthView('signup')} />
            </motion.div>
          ) : (
            <motion.div key="signup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full flex justify-center">
              <Signup auth={auth} db={db} onSignup={handleSignup} onSwitchToLogin={() => setAuthView('login')} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // VERIFICATION REQUIRED VIEW
  if (!user.emailVerified) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 md-surface text-center">
        <div className="w-24 h-24 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mb-6 text-yellow-600 animate-bounce">
          <Mail className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-2">Verify Your Email</h2>
        <p className="text-slate-500 mb-2 max-w-xs mx-auto">
          We sent a link to:
        </p>
        <p className="text-lg font-bold text-slate-800 dark:text-white mb-6 bg-slate-100 dark:bg-slate-800 py-2 px-4 rounded-lg">
          {user.email}
        </p>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl mb-8 max-w-xs text-left">
          <p className="text-xs font-bold text-blue-600 mb-1">Steps:</p>
          <ol className="list-decimal list-inside text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <li>Open your <b>Gmail</b> app.</li>
            <li>Check <b>Spam/Junk</b> folder (important!).</li>
            <li>Click the link from <b>noreply@...</b></li>
            <li>Come back here and click "I have verified".</li>
          </ol>
        </div>

        <button
          onClick={checkVerification}
          className="w-full max-w-xs py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black shadow-lg shadow-green-500/30 mb-4 flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-5 h-5" /> I have verified
        </button>

        <button
          onClick={async () => {
            if (auth.currentUser) {
              const btn = document.getElementById('resend-btn');
              if (btn) btn.innerText = "Sending...";
              try {
                await sendEmailVerification(auth.currentUser);
                alert(`Email Sent! Please check ${user.email} (and Spam folder).`);
              } catch (e) {
                if (e.code === 'auth/too-many-requests') {
                  alert("Please wait a few minutes before resending.");
                } else {
                  alert("Error: " + e.message);
                }
              } finally {
                if (btn) btn.innerText = "Resend Link";
              }
            }
          }}
          id="resend-btn"
          className="text-blue-600 font-bold text-sm mb-6 hover:underline"
        >
          Resend Link
        </button>

        <div className="border-t border-slate-200 dark:border-slate-700 w-full max-w-xs pt-6">
          <p className="text-xs text-slate-400 mb-2">Wrong email address?</p>
          <button
            onClick={handleLogout}
            className="text-red-500 font-bold text-sm hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 rounded-lg transition-colors"
          >
            Log Out & Create New Account
          </button>
        </div>
      </div>
    );
  }

  const requestAllPermissions = async () => {
    try {
      const res = await Geolocation.requestPermissions();
      console.log('[Permissions] Request result:', res);
      await checkPermissions();
    } catch (e) {
      console.error('[Permissions] Request failed:', e);
      await checkPermissions();
    }
  };

  // MAIN APP VIEW
  return (
    <div className="min-h-screen flex flex-col items-center p-6 pb-40 safe-area-inset-top md-surface">
      <AnimatePresence>
        {showPermissionOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                {!locationServiceEnabled || !permissionsGranted.location ? (
                  <MapPin className="w-10 h-10 text-blue-600" />
                ) : (
                  <ShieldAlert className="w-10 h-10 text-blue-600" />
                )}
              </div>

              {!locationServiceEnabled ? (
                <>
                  <h2 className="text-2xl font-black mb-4">Turn on Device Location</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                    Please turn on your phone's <b>Location</b> (GPS) to continue.
                  </p>
                  <button
                    onClick={enableLocation}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                  >
                    Turn On Location
                  </button>
                </>
              ) : !permissionsGranted.location ? (
                <>
                  <h2 className="text-2xl font-black mb-4">Allow Location Access</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                    Google Mesh needs permission to access your location.
                  </p>
                  <button
                    onClick={requestAllPermissions}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                  >
                    Allow Access
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-black mb-4">Enable Nearby Devices</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                    Google Mesh needs Bluetooth access to detect nearby devices and communicate offline.
                  </p>
                  <button
                    onClick={enableBluetooth}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                  >
                    Enable Bluetooth
                  </button>
                </>
              )}

              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={checkPermissions}
                  className="text-xs text-blue-600 font-bold hover:underline flex items-center justify-center gap-2"
                >
                  <RotateCw className="w-3 h-3" /> Refresh Status
                </button>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                  Required for Offline Safety
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {nearbyEmergency && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-4 left-4 right-4 z-[60] emergency-card"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center animate-pulse" style={{ background: 'var(--emergency-red)' }}>
                <AlertTriangle className="text-white w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--emergency-red)' }}>Nearby Emergency!</h3>
                <p className="text-xs font-medium" style={{ color: 'var(--md-on-surface)' }}>{nearbyEmergency.userName} needs help</p>
                <p className="text-[10px] font-mono" style={{ color: 'var(--md-on-surface-variant)' }}>Distance: {nearbyEmergency.distance.toFixed(0)}m • Hops: {nearbyEmergency.hops}</p>
              </div>
              <button onClick={() => setNearbyEmergency(null)} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--md-on-surface-variant)' }} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="w-full flex flex-col gap-6 mb-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <motion.div whileHover={{ rotate: 5 }} className="w-12 h-12 rounded-2xl flex items-center justify-center md-elevation-3">
              <img src="/google-mesh-logo.svg" alt="Google Mesh" className="w-full h-full" />
            </motion.div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-google-display" style={{ color: 'var(--md-on-surface)' }}>Google Mesh</h1>
              <p className="text-[8px] uppercase tracking-[0.3em] font-bold" style={{ color: 'var(--md-on-surface-variant)' }}>Emergency Response</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={online ? 'status-online' : 'status-offline'}>
              <div className={`w-2 h-2 rounded-full ${online ? 'bg-current animate-pulse' : 'bg-current'}`} />
              {online ? 'ONLINE' : 'OFFLINE'}
            </div>
            <button
              onClick={() => auth.signOut()}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] font-black px-3 py-2 rounded-xl transition-colors uppercase tracking-wider"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between bg-white/5 dark:bg-white/5 p-2 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-10 h-10 rounded-xl md-surface-variant md-elevation-1 flex items-center justify-center transition-all">
              {theme === 'dark' ? <Sun className="w-5 h-5" style={{ color: 'var(--google-yellow)' }} /> : <Moon className="w-5 h-5" style={{ color: 'var(--google-blue)' }} />}
            </motion.button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={shareApp} className="w-10 h-10 rounded-xl md-surface-variant md-elevation-1 flex items-center justify-center transition-all relative">
              <Share2 className="w-5 h-5" style={{ color: 'var(--md-on-surface-variant)' }} />
              {shareStatus === 'copied' && <motion.span initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute -bottom-8 text-[8px] font-black whitespace-nowrap" style={{ color: 'var(--google-green)' }}>COPIED</motion.span>}
            </motion.button>
          </div>
          <div className="flex items-center gap-3 px-3">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold opacity-60 uppercase tracking-tighter">Device ID</span>
              <span className="text-xs font-mono font-black">{deviceId}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col items-center justify-start max-w-md relative">
        <AnimatePresence mode="wait">
          {activeTab === 'sos' && (
            <motion.div key="sos" initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -20 }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="flex flex-col items-center w-full">
              <div className="relative mb-12">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={sendSOS}
                  disabled={status === 'sending'}
                  className={`sos-button w-80 h-80 text-white transition-colors duration-500 ${status === 'success' ? 'bg-green-600 shadow-green-500/50' : ''}`}
                  style={status === 'success' ? { background: '#16a34a', boxShadow: '0 20px 60px -10px rgba(22, 163, 74, 0.5)' } : {}}
                >
                  <AnimatePresence mode="wait">
                    {status === 'idle' && (
                      <motion.div key="idle" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center">
                        <span className="text-7xl font-black tracking-tighter mb-2 drop-shadow-2xl">SOS</span>
                        <div className="h-1.5 w-16 bg-white/40 rounded-full mb-4" />
                        <span className="text-[12px] font-black opacity-90 uppercase tracking-[0.4em]">Tap for Help</span>
                      </motion.div>
                    )}
                    {status === 'sending' && (
                      <motion.div key="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
                        <div className="w-20 h-20 border-[8px] border-white/20 border-t-white rounded-full animate-spin mb-8" />
                        <span className="text-sm font-black uppercase tracking-[0.3em] animate-pulse">Sending</span>
                      </motion.div>
                    )}
                    {status === 'success' && (
                      <motion.div key="success" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} className="flex flex-col items-center">
                        <CheckCircle2 className="w-24 h-24 mb-6" />
                        <span className="text-sm font-black uppercase tracking-[0.3em]">Signal Sent</span>
                      </motion.div>
                    )}
                    {status === 'error' && (
                      <motion.div key="error" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} className="flex flex-col items-center">
                        <AlertTriangle className="w-20 h-20 mb-6" />
                        <span className="text-sm font-black uppercase tracking-[0.3em]">GPS Error</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>

              <div className="w-full mb-6">
                <input
                  type="text"
                  value={sosMessage}
                  onChange={(e) => setSosMessage(e.target.value)}
                  placeholder="Optional message (e.g., 'Medical emergency')"
                  className="w-full px-4 py-3 rounded-2xl md-surface-variant text-google-body border-2 border-transparent focus:border-current transition-all outline-none"
                  style={{ color: 'var(--md-on-surface)' }}
                  maxLength={100}
                />
              </div>

              <div className="grid grid-cols-2 gap-6 w-full mb-8">
                <div className="info-card">
                  <div className="flex items-center gap-3 mb-2" style={{ color: 'var(--md-on-surface-variant)' }}>
                    <Smartphone className="w-4 h-4" />
                    <span className="text-google-label">Device ID</span>
                  </div>
                  <span className="text-sm font-mono font-bold" style={{ color: 'var(--md-on-surface)' }}>{deviceId}</span>
                </div>
                <div className="info-card">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3" style={{ color: 'var(--md-on-surface-variant)' }}>
                      <MapPin className="w-4 h-4" />
                      <span className="text-google-label">Location</span>
                    </div>
                    {geoStatus === 'denied' && <button onClick={startTracking} className="text-[10px] text-blue-500 font-bold">RETRY</button>}
                  </div>

                  <span className={`text-sm font-mono font-bold ${location.lat ? '' : 'animate-pulse'}`} style={{ color: location.lat ? 'var(--md-on-surface)' : 'var(--emergency-red)' }}>
                    {location.lat
                      ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`
                      : geoStatus === 'denied' ? 'Permission Denied'
                        : geoStatus === 'unavailable' ? 'Signal Weak / Unavailable'
                          : 'Acquiring GPS...'}
                  </span>
                </div>
              </div>

              <div className="w-full google-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${meshRelayActive ? 'animate-ping' : ''}`} style={{ background: meshRelayActive ? 'var(--google-green)' : 'var(--md-on-surface-variant)' }} />
                    <div>
                      <p className="text-google-label" style={{ color: 'var(--md-on-surface-variant)' }}>Mesh Network</p>
                      <p className="text-xs font-medium" style={{ color: 'var(--md-on-surface)' }}>{meshRelayActive ? 'Relaying Messages' : 'Listening'}</p>
                    </div>
                  </div>
                  <Radio className="w-6 h-6" style={{ color: meshRelayActive ? 'var(--google-green)' : 'var(--md-on-surface-variant)' }} />
                </div>
              </div>

              {syncStatus.pending > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full google-card mt-4" style={{ borderLeft: '4px solid var(--google-yellow)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CloudOff className="w-5 h-5" style={{ color: 'var(--google-yellow)' }} />
                      <div>
                        <p className="text-google-label" style={{ color: 'var(--md-on-surface-variant)' }}>Pending Sync</p>
                        <p className="text-xs font-medium" style={{ color: 'var(--md-on-surface)' }}>{syncStatus.pending} message{syncStatus.pending > 1 ? 's' : ''} waiting</p>
                      </div>
                    </div>
                    {syncStatus.syncing && <CloudUpload className="w-5 h-5 animate-pulse" style={{ color: 'var(--google-blue)' }} />}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
          {activeTab === 'messages' && <Messages key="messages" deviceId={deviceId} db={db} />}
          {activeTab === 'profile' && <Profile key="profile" onLogout={handleLogout} user={user} userProfile={userProfile} db={db} />}
        </AnimatePresence>
      </main>

      <nav className="fixed bottom-8 left-6 right-6 z-50">
        <div className="nav-bar">
          <NavButton active={activeTab === 'messages'} onClick={() => setActiveTab('messages')} icon={<MessageSquare className="w-6 h-6" />} label="Messages" />
          <NavButton active={activeTab === 'sos'} onClick={() => setActiveTab('sos')} icon={<Radio className="w-8 h-8" />} label="SOS" primary />
          <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<User className="w-6 h-6" />} label="Profile" />
        </div>
      </nav>
    </div>
  );
}

function NavButton({ active, onClick, icon, label, primary }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center transition-all duration-300 ${primary
        ? 'w-20 h-20 -mt-14 rounded-full md-elevation-4 text-white'
        : active
          ? 'flex-1 scale-110'
          : 'flex-1'
        }`}
      style={primary ? { background: 'linear-gradient(135deg, var(--emergency-red) 0%, var(--emergency-red-dark) 100%)' } : { color: active ? 'var(--google-blue)' : 'var(--md-on-surface-variant)' }}
    >
      <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.9 }}>
        {icon}
      </motion.div>
      {!primary && <span className="text-google-label mt-1.5">{label}</span>}
    </button>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-900 text-white">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-slate-400 mb-4 text-center">The app encountered a critical error.</p>
          <pre className="bg-slate-800 p-4 rounded text-xs overflow-auto max-w-full">
            {this.state.error && this.state.error.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-3 bg-blue-600 rounded-xl font-bold"
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
