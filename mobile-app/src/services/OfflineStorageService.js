/**
 * OfflineStorageService - Handles offline message storage and sync
 * Uses IndexedDB with LocalStorage fallback
 */

class OfflineStorageService {
    constructor() {
        this.dbName = 'GoogleSOSDB';
        this.dbVersion = 1;
        this.storeName = 'pendingMessages';
        this.db = null;
        this.useLocalStorage = false;

        this.init();
    }

    /**
     * Initialize IndexedDB
     */
    async init() {
        try {
            this.db = await this.openDatabase();
            console.log('[OfflineStorage] IndexedDB initialized');
        } catch (error) {
            console.warn('[OfflineStorage] IndexedDB failed, using LocalStorage fallback', error);
            this.useLocalStorage = true;
        }
    }

    /**
     * Open IndexedDB database
     */
    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, {
                        keyPath: 'id',
                        autoIncrement: true
                    });

                    // Create indexes
                    objectStore.createIndex('messageId', 'messageId', { unique: true });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    objectStore.createIndex('type', 'type', { unique: false });
                    objectStore.createIndex('synced', 'synced', { unique: false });
                }
            };
        });
    }

    /**
     * Store message for later sync
     */
    async storeMessage(message) {
        const record = {
            messageId: message.messageId || `msg_${Date.now()}_${Math.random()}`,
            type: message.type,
            payload: message.payload,
            timestamp: Date.now(),
            synced: false,
            retryCount: 0
        };

        if (this.useLocalStorage) {
            return this.storeInLocalStorage(record);
        } else {
            return this.storeInIndexedDB(record);
        }
    }

    /**
     * Store in IndexedDB
     */
    async storeInIndexedDB(record) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.add(record);

            request.onsuccess = () => {
                console.log(`[OfflineStorage] Stored message: ${record.messageId}`);
                resolve(request.result);
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Store in LocalStorage (fallback)
     */
    storeInLocalStorage(record) {
        try {
            const stored = this.getLocalStorageMessages();
            stored.push(record);
            localStorage.setItem('google_sos_pending', JSON.stringify(stored));
            console.log(`[OfflineStorage] Stored in LocalStorage: ${record.messageId}`);
            return Promise.resolve(record.messageId);
        } catch (error) {
            console.error('[OfflineStorage] LocalStorage error:', error);
            return Promise.reject(error);
        }
    }

    /**
     * Get all pending messages
     */
    async getPendingMessages() {
        if (this.useLocalStorage) {
            return this.getLocalStorageMessages().filter(msg => !msg.synced);
        } else {
            return this.getIndexedDBMessages();
        }
    }

    /**
     * Get messages from IndexedDB
     */
    async getIndexedDBMessages() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const index = objectStore.index('synced');
            // Use openCursor without key range to avoid DataError
            const request = index.openCursor(); 

            const results = [];
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    // Manual filter for synced: false
                    if (cursor.value.synced === false) {
                        results.push(cursor.value);
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get messages from LocalStorage
     */
    getLocalStorageMessages() {
        try {
            const stored = localStorage.getItem('google_sos_pending');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('[OfflineStorage] Error reading LocalStorage:', error);
            return [];
        }
    }

    /**
     * Mark message as synced
     */
    async markAsSynced(messageId) {
        if (this.useLocalStorage) {
            return this.markSyncedInLocalStorage(messageId);
        } else {
            return this.markSyncedInIndexedDB(messageId);
        }
    }

    /**
     * Mark as synced in IndexedDB
     */
    async markSyncedInIndexedDB(messageId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const index = objectStore.index('messageId');
            const request = index.get(messageId);

            request.onsuccess = () => {
                const record = request.result;
                if (record) {
                    record.synced = true;
                    record.syncedAt = Date.now();
                    const updateRequest = objectStore.put(record);

                    updateRequest.onsuccess = () => {
                        console.log(`[OfflineStorage] Marked as synced: ${messageId}`);
                        resolve();
                    };
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    resolve(); // Message not found, already synced or deleted
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Mark as synced in LocalStorage
     */
    markSyncedInLocalStorage(messageId) {
        try {
            const stored = this.getLocalStorageMessages();
            const updated = stored.map(msg =>
                msg.messageId === messageId
                    ? { ...msg, synced: true, syncedAt: Date.now() }
                    : msg
            );
            localStorage.setItem('google_sos_pending', JSON.stringify(updated));
            console.log(`[OfflineStorage] Marked as synced in LocalStorage: ${messageId}`);
            return Promise.resolve();
        } catch (error) {
            return Promise.reject(error);
        }
    }

    /**
     * Clear all synced messages (cleanup)
     */
    async clearSyncedMessages() {
        if (this.useLocalStorage) {
            const stored = this.getLocalStorageMessages();
            const unsynced = stored.filter(msg => !msg.synced);
            localStorage.setItem('google_sos_pending', JSON.stringify(unsynced));
            console.log(`[OfflineStorage] Cleared synced messages from LocalStorage`);
            return Promise.resolve();
        } else {
            return this.clearSyncedFromIndexedDB();
        }
    }

    /**
     * Clear synced messages from IndexedDB
     */
    async clearSyncedFromIndexedDB() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const index = objectStore.index('synced');
            // Use openCursor without key range to avoid DataError
            const request = index.openCursor(); 

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    // Manual filter for synced: true
                    if (cursor.value.synced === true) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    console.log('[OfflineStorage] Cleared synced messages from IndexedDB');
                    resolve();
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get storage statistics
     */
    async getStats() {
        const pending = await this.getPendingMessages();
        return {
            pendingCount: pending.length,
            storageType: this.useLocalStorage ? 'LocalStorage' : 'IndexedDB',
            oldestMessage: pending.length > 0
                ? new Date(Math.min(...pending.map(m => m.timestamp)))
                : null
        };
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.db) {
            this.db.close();
        }
        console.log('[OfflineStorage] Service destroyed');
    }
}

export default OfflineStorageService;
