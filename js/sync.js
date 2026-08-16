/* ==========================================================================
   EMS Consumables Management System - Cloud Realtime Synchronization Engine
   ========================================================================== */

const CLOUD_STORAGE_KEYS = {
  SYNC_ENABLED: "EMS_CLOUD_SYNC_ENABLED",
  SYNC_CHANNEL: "EMS_CLOUD_SYNC_CHANNEL",
  LAST_SYNC_TIME: "EMS_LAST_SYNC_TIMESTAMP"
};

// Default shared cloud endpoint channel for EMS Station
const DEFAULT_SHARED_CHANNEL = "ems_shared_station_inventory_v2";

class CloudSync {
  constructor() {
    this.isEnabled = localStorage.getItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED) !== "false"; // Default to enabled
    this.channel = localStorage.getItem(CLOUD_STORAGE_KEYS.SYNC_CHANNEL) || DEFAULT_SHARED_CHANNEL;
    this.pollInterval = null;
    this.broadcastChannel = null;
    this.isSyncing = false;
    
    // Cross-tab instant communication on the same computer
    if (window.BroadcastChannel) {
      this.broadcastChannel = new BroadcastChannel("ems_inventory_sync_channel");
      this.broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === "DATA_UPDATED") {
          store.init();
          if (typeof renderAllViews === "function") renderAllViews();
        }
      };
    }
  }

  init() {
    // Save default channel if not set
    if (!localStorage.getItem(CLOUD_STORAGE_KEYS.SYNC_CHANNEL)) {
      localStorage.setItem(CLOUD_STORAGE_KEYS.SYNC_CHANNEL, DEFAULT_SHARED_CHANNEL);
    }

    this.updateSyncUIStatus();
    
    if (this.isEnabled) {
      // Pull latest data from cloud on startup
      this.pullFromCloud(true);
      this.startRealtimePolling();
    }
  }

  // Set custom channel ID (e.g. "taipei_station_1")
  setChannel(channelName) {
    if (!channelName) channelName = DEFAULT_SHARED_CHANNEL;
    this.channel = channelName.trim();
    this.isEnabled = true;
    localStorage.setItem(CLOUD_STORAGE_KEYS.SYNC_CHANNEL, this.channel);
    localStorage.setItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED, "true");
    
    this.updateSyncUIStatus();
    this.pushToCloud(false);
    this.startRealtimePolling();
  }

  disableSync() {
    this.isEnabled = false;
    localStorage.setItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED, "false");
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.updateSyncUIStatus();
    if (typeof showToast === "function") showToast("已切換為本地單機模式", "info");
  }

  updateSyncUIStatus() {
    const pill = document.getElementById("cloudSyncPill");
    const textEl = document.getElementById("cloudSyncStatusText");
    if (!pill || !textEl) return;

    if (this.isEnabled) {
      pill.className = "system-status-pill success pulse";
      textEl.textContent = `🟢 雲端同步中 (${this.channel})`;
    } else {
      pill.className = "system-status-pill warning";
      textEl.textContent = "🟡 單機模式 (點擊開啟同步)";
    }
  }

  // Notify other tabs on same device
  notifyLocalTabs() {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type: "DATA_UPDATED", timestamp: Date.now() });
    }
  }

  // Push local state to 100% Live Cloud Storage API (kvdb.io)
  async pushToCloud(showToastMsg = false) {
    this.notifyLocalTabs();
    if (!this.isEnabled || this.isSyncing) return;

    this.isSyncing = true;
    const payload = {
      supplies: store.getSupplies(),
      locations: store.getLocations(),
      users: store.getUsers(),
      reminders: store.getReminderSettings(),
      auditLogs: store.getAuditLogs().slice(0, 50),
      updatedAt: new Date().getTime()
    };

    try {
      const url = `https://kvdb.io/9k8Jz8Q8Zq8/${encodeURIComponent(this.channel)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, payload.updatedAt.toString());
        if (showToastMsg && typeof showToast === "function") {
          showToast("已成功將最新資料上傳同步至雲端！", "success");
        }
      }
    } catch (err) {
      console.warn("[Sync Push Error]:", err);
    } finally {
      this.isSyncing = false;
    }
  }

  // Pull latest data from Cloud Storage API
  async pullFromCloud(silent = false) {
    if (!this.isEnabled || this.isSyncing) return;

    try {
      const url = `https://kvdb.io/9k8Jz8Q8Zq8/${encodeURIComponent(this.channel)}`;
      const res = await fetch(url);

      if (res.ok) {
        const data = await res.json();

        if (data && data.supplies && Array.isArray(data.supplies)) {
          const lastLocalTime = parseInt(localStorage.getItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME) || "0");
          const cloudTime = data.updatedAt || 0;

          // If cloud data is newer or first load
          if (cloudTime > lastLocalTime || silent) {
            localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(data.supplies));
            if (data.locations) localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(data.locations));
            if (data.users) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
            if (data.reminders) localStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(data.reminders));
            if (data.auditLogs) localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(data.auditLogs));

            localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, cloudTime.toString());
            
            if (typeof renderAllViews === "function") renderAllViews();
            if (!silent && typeof showToast === "function") {
              showToast("已從雲端同步載入最新耗材資料！", "success");
            }
          }
        }
      }
    } catch (err) {
      console.warn("[Sync Pull Error]:", err);
    }
  }

  // Realtime polling loop (checks cloud every 3 seconds)
  startRealtimePolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);

    this.pollInterval = setInterval(() => {
      this.pullFromCloud(true);
    }, 3000);
  }
}

const sync = new CloudSync();
