/**
 * SyncManager - Manages synchronization of offline messages to Firebase
 * Monitors internet connectivity and syncs pending messages when online
 */

import { ref, set, push } from 'firebase/database';

class SyncManager {
    constructor(database, offlineStorage) {
        this.db = database;
        this.offlineStorage = offlineStorage;
        this.isOnline = navigator.onLine;
        this.isSyncing = false;
        this.syncListeners = [];
        this.retryDelay = 5000; // 5 seconds initial retry delay
        this.maxRetryDelay = 60000; // 1 minute max retry delay

        this.init();
    }

    /**
     * Initialize sync manager
     */
    init() {
        // Listen for online/offline events
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());

        // Periodic sync check (every 30 seconds)
        setInterval(() => this.checkAndSync(), 30000);

        // Initial sync if online
        if (this.isOnline) {
            setTimeout(() => this.syncPendingMessages(), 2000);
        }

        console.log('[SyncManager] Initialized');
    }

    /**
     * Handle online event
     */
    handleOnline() {
        console.log('[SyncManager] Internet connection restored');
        this.isOnline = true;
        this.notifyListeners({ type: 'online' });

        // Sync after a short delay
        setTimeout(() => this.syncPendingMessages(), 1000);
    }

    /**
     * Handle offline event
     */
    handleOffline() {
        console.log('[SyncManager] Internet connection lost');
        this.isOnline = false;
        this.notifyListeners({ type: 'offline' });
    }

    /**
     * Check connectivity and sync if needed
     */
    async checkAndSync() {
        // Update online status
        this.isOnline = navigator.onLine;

        if (this.isOnline && !this.isSyncing) {
            const stats = await this.offlineStorage.getStats();
            if (stats.pendingCount > 0) {
                console.log(`[SyncManager] Found ${stats.pendingCount} pending messages`);
                this.syncPendingMessages();
            }
        }
    }

    /**
     * Sync all pending messages to Firebase
     */
    async syncPendingMessages() {
        if (!this.isOnline) {
            console.log('[SyncManager] Cannot sync - offline');
            return;
        }

        if (this.isSyncing) {
            console.log('[SyncManager] Sync already in progress');
            return;
        }

        this.isSyncing = true;
        this.notifyListeners({ type: 'sync_start' });

        try {
            const pendingMessages = await this.offlineStorage.getPendingMessages();

            if (pendingMessages.length === 0) {
                console.log('[SyncManager] No pending messages to sync');
                this.isSyncing = false;
                return;
            }

            console.log(`[SyncManager] Syncing ${pendingMessages.length} messages...`);

            let synced = 0;
            let failed = 0;

            for (const message of pendingMessages) {
                try {
                    await this.uploadMessage(message);
                    await this.offlineStorage.markAsSynced(message.messageId);
                    synced++;

                    this.notifyListeners({
                        type: 'sync_progress',
                        synced,
                        total: pendingMessages.length
                    });
                } catch (error) {
                    console.error(`[SyncManager] Failed to sync message ${message.messageId}:`, error);
                    failed++;
                }
            }

            // Cleanup synced messages
            await this.offlineStorage.clearSyncedMessages();

            console.log(`[SyncManager] Sync complete: ${synced} synced, ${failed} failed`);

            this.notifyListeners({
                type: 'sync_complete',
                synced,
                failed
            });

        } catch (error) {
            console.error('[SyncManager] Sync error:', error);
            this.notifyListeners({
                type: 'sync_error',
                error: error.message
            });
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Upload a single message to Firebase
     */
    async uploadMessage(message) {
        const { type, payload, messageId } = message;

        if (type === 'SOS_BROADCAST') {
            // Upload SOS message
            const sosRef = ref(this.db, `sos_messages/${messageId}`);
            await set(sosRef, {
                ...payload,
                syncedFromOffline: true,
                syncedAt: Date.now()
            });
            console.log(`[SyncManager] Uploaded SOS: ${messageId}`);
        } else if (type === 'CHAT_BROADCAST') {
            // Upload chat message
            const chatRef = ref(this.db, `chats/${payload.deviceId}`);
            await push(chatRef, {
                ...payload.msg,
                syncedFromOffline: true,
                syncedAt: Date.now()
            });
            console.log(`[SyncManager] Uploaded chat: ${messageId}`);
        } else {
            console.warn(`[SyncManager] Unknown message type: ${type}`);
        }
    }

    /**
     * Register sync event listener
     */
    onSyncEvent(listener) {
        this.syncListeners.push(listener);
        return () => {
            const index = this.syncListeners.indexOf(listener);
            if (index > -1) {
                this.syncListeners.splice(index, 1);
            }
        };
    }

    /**
     * Notify all listeners
     */
    notifyListeners(event) {
        this.syncListeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error('[SyncManager] Listener error:', error);
            }
        });
    }

    /**
     * Get sync status
     */
    getStatus() {
        return {
            isOnline: this.isOnline,
            isSyncing: this.isSyncing
        };
    }

    /**
     * Force sync (manual trigger)
     */
    forceSync() {
        console.log('[SyncManager] Manual sync triggered');
        return this.syncPendingMessages();
    }

    /**
     * Cleanup
     */
    destroy() {
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
        this.syncListeners = [];
        console.log('[SyncManager] Service destroyed');
    }
}

export default SyncManager;
