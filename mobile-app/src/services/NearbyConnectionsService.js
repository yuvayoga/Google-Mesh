/**
 * NearbyConnectionsService - Handles mesh networking via BroadcastChannel
 * Simulates Bluetooth/Wi-Fi Direct for web, will use native APIs in Android build
 */

class NearbyConnectionsService {
    constructor(deviceId) {
        this.deviceId = deviceId;
        this.meshChannel = new BroadcastChannel('google_sos_mesh');
        this.connectedPeers = new Map();
        this.messageCache = new Map();
        this.messageHandlers = [];
        this.maxHops = 5; // Maximum hops for message forwarding
        this.ttl = 300000; // 5 minutes TTL for messages

        this.init();
    }

    init() {
        // Listen for mesh messages
        this.meshChannel.onmessage = (event) => {
            this.handleIncomingMessage(event.data);
        };

        // Periodic cleanup of old messages
        setInterval(() => this.cleanupOldMessages(), 60000);

        console.log(`[NearbyConnections] Initialized for device: ${this.deviceId}`);
    }

    /**
     * Handle incoming mesh messages
     */
    handleIncomingMessage(data) {
        const { type, payload, messageId, hops = 0, timestamp, senderId } = data;

        // Ignore messages from self
        if (senderId === this.deviceId) return;

        // Check if we've already seen this message (prevent loops)
        if (this.messageCache.has(messageId)) {
            console.log(`[NearbyConnections] Duplicate message ignored: ${messageId}`);
            return;
        }

        // Check if message has exceeded max hops
        if (hops >= this.maxHops) {
            console.log(`[NearbyConnections] Message exceeded max hops: ${messageId}`);
            return;
        }

        // Check if message has expired
        const age = Date.now() - timestamp;
        if (age > this.ttl) {
            console.log(`[NearbyConnections] Expired message ignored: ${messageId}`);
            return;
        }

        // Cache this message
        this.messageCache.set(messageId, {
            timestamp,
            hops,
            type,
            payload
        });

        console.log(`[NearbyConnections] Received ${type} from ${senderId} (hops: ${hops})`);

        // Notify all registered handlers
        this.messageHandlers.forEach(handler => {
            try {
                handler({ type, payload, messageId, hops, senderId });
            } catch (error) {
                console.error('[NearbyConnections] Handler error:', error);
            }
        });

        // Forward message to other peers (multi-hop)
        this.forwardMessage(data);
    }

    /**
     * Forward message to other peers (multi-hop relay)
     */
    forwardMessage(originalData) {
        const { messageId, hops, timestamp } = originalData;

        // Increment hop count
        const newHops = hops + 1;

        // Don't forward if we've reached max hops
        if (newHops >= this.maxHops) return;

        // Forward after a small delay to prevent network congestion
        setTimeout(() => {
            const forwardedData = {
                ...originalData,
                hops: newHops,
                forwardedBy: this.deviceId
            };

            this.meshChannel.postMessage(forwardedData);
            console.log(`[NearbyConnections] Forwarded message ${messageId} (hops: ${newHops})`);
        }, 100 + Math.random() * 200); // Random delay 100-300ms
    }

    /**
     * Broadcast SOS message to mesh network
     */
    broadcastSOS(sosData) {
        const messageId = `sos_${this.deviceId}_${Date.now()}`;
        const message = {
            type: 'SOS_BROADCAST',
            payload: sosData,
            messageId,
            hops: 0,
            timestamp: Date.now(),
            senderId: this.deviceId
        };

        this.meshChannel.postMessage(message);
        console.log(`[NearbyConnections] Broadcasted SOS: ${messageId}`);

        return messageId;
    }

    /**
     * Broadcast chat message to mesh network
     */
    broadcastChat(chatData) {
        const messageId = `chat_${this.deviceId}_${Date.now()}`;
        const message = {
            type: 'CHAT_BROADCAST',
            payload: chatData,
            messageId,
            hops: 0,
            timestamp: Date.now(),
            senderId: this.deviceId
        };

        this.meshChannel.postMessage(message);
        console.log(`[NearbyConnections] Broadcasted chat: ${messageId}`);

        return messageId;
    }

    /**
     * Register a message handler
     */
    onMessage(handler) {
        this.messageHandlers.push(handler);
        return () => {
            const index = this.messageHandlers.indexOf(handler);
            if (index > -1) {
                this.messageHandlers.splice(index, 1);
            }
        };
    }

    /**
     * Clean up old messages from cache
     */
    cleanupOldMessages() {
        const now = Date.now();
        let cleaned = 0;

        for (const [messageId, data] of this.messageCache.entries()) {
            if (now - data.timestamp > this.ttl) {
                this.messageCache.delete(messageId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[NearbyConnections] Cleaned up ${cleaned} old messages`);
        }
    }

    /**
     * Get mesh network statistics
     */
    getStats() {
        return {
            deviceId: this.deviceId,
            cachedMessages: this.messageCache.size,
            connectedPeers: this.connectedPeers.size,
            handlers: this.messageHandlers.length
        };
    }

    /**
     * Cleanup and disconnect
     */
    destroy() {
        this.meshChannel.close();
        this.messageCache.clear();
        this.connectedPeers.clear();
        this.messageHandlers = [];
        console.log('[NearbyConnections] Service destroyed');
    }
}

export default NearbyConnectionsService;
