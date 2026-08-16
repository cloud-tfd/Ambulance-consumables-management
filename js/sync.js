/* ==========================================================================
   EMS Consumables Management System - Cloud Realtime Synchronization Engine
   ========================================================================== */

const CLOUD_STORAGE_KEYS = {
  SYNC_ENABLED: "EMS_CLOUD_SYNC_ENABLED",
  SYNC_CONFIG: "EMS_CLOUD_SYNC_CONFIG",
  LAST_SYNC_TIME: "EMS_LAST_SYNC_TIMESTAMP"
};

class CloudSync {
  constructor() {
    this.isEnabled = localStorage.getItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED) === "true";
    this.config = JSON.parse(localStorage.getItem(CLOUD_STORAGE_KEYS.SYNC_CONFIG) || "{}");
    this.pollInterval = null;
    this.broadcastChannel = null;
    
    if (window.BroadcastChannel) {
      this.broadcastChannel = new BroadcastChannel("ems_inventory_sync_channel");
      this.broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === "DATA_UPDATED") {
          console.log("[Sync] Received tab broadcast update, re-rendering views...");
          store.init();
          renderAllViews();
        }
      };
    }
  }

  init() {
    this.updateSyncUIStatus();
    if (this.isEnabled && this.config.apiKey && this.config.binId) {
      this.startRealtimePolling();
    }
  }

  // Save Cloud Credentials (JSONBin / Firebase / REST Cloud)
  saveConfig(binId, apiKey) {
    this.config = { binId, apiKey };
    this.isEnabled = true;
    localStorage.setItem(CLOUD_STORAGE_KEYS.SYNC_CONFIG, JSON.stringify(this.config));
    localStorage.setItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED, "true");
    
    this.updateSyncUIStatus();
    this.pushToCloud(true); // Initial push
    this.startRealtimePolling();
  }

  disableSync() {
    this.isEnabled = false;
    localStorage.setItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED, "false");
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.updateSyncUIStatus();
    showToast("已停用雲端即時同步，系統切換為本地離線模式", "info");
  }

  updateSyncUIStatus() {
    const pill = document.getElementById("cloudSyncPill");
    const textEl = document.getElementById("cloudSyncStatusText");
    if (!pill || !textEl) return;

    if (this.isEnabled && this.config.binId) {
      pill.className = "system-status-pill success pulse";
      textEl.textContent = "雲端即時同步中 (Live Sync)";
    } else {
      pill.className = "system-status-pill warning";
      textEl.textContent = "本地模式 (點擊設定雲端同步)";
    }
  }

  // Broadcast data changes to other open tabs on the same computer instantly
  notifyLocalTabs() {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type: "DATA_UPDATED", timestamp: Date.now() });
    }
  }

  // Push local state to Cloud Database
  async pushToCloud(silent = false) {
    this.notifyLocalTabs();

    if (!this.isEnabled || !this.config.binId || !this.config.apiKey) return;

    const payload = {
      supplies: store.getSupplies(),
      locations: store.getLocations(),
      users: store.getUsers(),
      reminders: store.getReminderSettings(),
      auditLogs: store.getAuditLogs().slice(0, 50),
      updatedAt: new Date().toISOString()
    };

    try {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${this.config.binId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": this.config.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, new Date().toLocaleTimeString("zh-TW"));
        if (!silent) showToast("資料已即時同步至雲端！", "success");
      } else {
        const err = await res.text();
        console.error("[Sync] Push to cloud error:", err);
      }
    } catch (err) {
      console.error("[Sync] Network error pushing to cloud:", err);
    }
  }

  // Pull latest data from Cloud Database
  async pullFromCloud(silent = true) {
    if (!this.isEnabled || !this.config.binId || !this.config.apiKey) return;

    try {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${this.config.binId}/latest`, {
        headers: {
          "X-Master-Key": this.config.apiKey
        }
      });

      if (res.ok) {
        const json = await res.json();
        const data = json.record;

        if (data && data.supplies && Array.isArray(data.supplies)) {
          // Merge cloud supplies into LocalStorage
          localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(data.supplies));
          if (data.locations) localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(data.locations));
          if (data.users) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
          if (data.reminders) localStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(data.reminders));
          if (data.auditLogs) localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(data.auditLogs));

          localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, new Date().toLocaleTimeString("zh-TW"));
          renderAllViews();
          if (!silent) showToast("已從雲端載入最新同步數據！", "success");
        }
      }
    } catch (err) {
      console.error("[Sync] Pull from cloud error:", err);
    }
  }

  // Start Realtime Polling (Checks for changes every 4 seconds)
  startRealtimePolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollFromCloudSilently();

    this.pollInterval = setInterval(() => {
      this.pollFromCloudSilently();
    }, 4000);
  }

  async pollFromCloudSilently() {
    if (!this.isEnabled || !this.config.binId || !this.config.apiKey) return;

    try {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${this.config.binId}/latest`, {
        headers: {
          "X-Master-Key": this.config.apiKey
        }
      });

      if (res.ok) {
        const json = await res.json();
        const data = json.record;

        if (data && data.updatedAt) {
          const lastLocalTime = localStorage.getItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME);
          const cloudTime = new Date(data.updatedAt).toLocaleTimeString("zh-TW");

          // If cloud data is newer, update local view!
          if (cloudTime !== lastLocalTime && data.supplies) {
            localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(data.supplies));
            if (data.locations) localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(data.locations));
            if (data.users) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
            if (data.reminders) localStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(data.reminders));
            if (data.auditLogs) localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(data.auditLogs));

            localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, cloudTime);
            renderAllViews();
          }
        }
      }
    } catch (e) {
      // Ignore background network polling errors
    }
  }
}

const sync = new CloudSync();
