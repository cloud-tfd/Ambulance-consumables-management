/* ==========================================================================
   EMS Consumables Management System - Google Firebase Realtime Cloud Sync Engine
   ========================================================================== */

// ★ Firebase Realtime Database 網址
const FIREBASE_DATABASE_URL = "https://consumables-management-c7aaa-default-rtdb.asia-southeast1.firebasedatabase.app";

const CLOUD_STORAGE_KEYS = {
  SYNC_ENABLED: "EMS_CLOUD_SYNC_ENABLED",
  FIREBASE_URL: "EMS_FIREBASE_CUSTOM_URL",
  LAST_SYNC_TIME: "EMS_LAST_SYNC_TIMESTAMP"
};

class CloudSync {
  constructor() {
    this.pollInterval = null;
    this.broadcastChannel = null;
    this.isSyncing = false;
    this.hasPermissionError = false;
    this.connectionStatus = "offline";

    // Always enable sync when URL is hardcoded in code
    const hasHardcodedUrl = typeof FIREBASE_DATABASE_URL === "string" && FIREBASE_DATABASE_URL.trim().length > 10;
    if (hasHardcodedUrl) {
      localStorage.setItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED, "true");
    }
    this.isEnabled = localStorage.getItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED) !== "false";

    // Cross-tab sync on same device
    if (window.BroadcastChannel) {
      this.broadcastChannel = new BroadcastChannel("ems_inventory_sync_channel");
      this.broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === "DATA_UPDATED") {
          if (typeof renderAllViews === "function") renderAllViews();
        }
      };
    }
  }

  init() {
    this.updateSyncUIStatus();

    if (this.isEnabled && this.getFirebaseUrl()) {
      // If this device has no local data at all, force pull from cloud first
      const hasLocalData = (localStorage.getItem(STORAGE_KEYS.SUPPLIES) || "[]") !== "[]";
      if (!hasLocalData) {
        // Brand new device — pull cloud data unconditionally, then start polling
        this._forcePullOnce().then(() => this.startRealtimePolling());
      } else {
        // Existing device — only pull if cloud is newer (protects local edits)
        this.pullFromCloud(true).then(() => this.startRealtimePolling());
      }
    }
  }

  // One-time force pull ignoring timestamp (for new/empty devices only)
  async _forcePullOnce() {
    const firebaseUrl = this.getFirebaseUrl();
    if (!firebaseUrl) return;
    try {
      const res = await fetch(firebaseUrl);
      if (res.ok) {
        const data = await res.json();
        this.connectionStatus = "online";
        this.updateSyncUIStatus();
        if (data && data.supplies && Array.isArray(data.supplies) && data.supplies.length > 0) {
          localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(data.supplies));
          if (data.locations) localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(data.locations));
          if (data.users) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
          if (data.reminders) localStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(data.reminders));
          if (data.auditLogs) localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(data.auditLogs));
          localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, String(data.updatedAt || Date.now()));
          if (typeof store !== "undefined") store.init();
          if (typeof renderAllViews === "function") renderAllViews();
          if (typeof showToast === "function") showToast("已從 Firebase 雲端載入最新資料！", "success");
        }
      }
    } catch (err) {
      console.warn("[Firebase Force Pull Error]:", err);
    }
  }

  getFirebaseUrl() {
    let customUrl = (localStorage.getItem(CLOUD_STORAGE_KEYS.FIREBASE_URL) || "").trim();
    if (!customUrl) {
      customUrl = (typeof FIREBASE_DATABASE_URL === "string" ? FIREBASE_DATABASE_URL : "").trim();
    }
    if (!customUrl || customUrl.length < 10) return null;
    if (customUrl.endsWith("/")) customUrl = customUrl.slice(0, -1);
    return `${customUrl}/ems_inventory_data.json`;
  }

  setCustomFirebaseUrl(url) {
    let cleanUrl = (url || "").trim();
    if (cleanUrl.endsWith("/")) cleanUrl = cleanUrl.slice(0, -1);
    localStorage.setItem(CLOUD_STORAGE_KEYS.FIREBASE_URL, cleanUrl);
    localStorage.setItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED, "true");
    this.isEnabled = true;
    this.updateSyncUIStatus();
  }

  disableSync() {
    this.isEnabled = false;
    localStorage.setItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED, "false");
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.connectionStatus = "offline";
    this.updateSyncUIStatus();
    if (typeof showToast === "function") showToast("已切換為單機模式", "info");
  }

  updateSyncUIStatus() {
    const pill = document.getElementById("cloudSyncPill");
    const textEl = document.getElementById("cloudSyncStatusText");
    if (!pill || !textEl) return;

    const firebaseUrl = this.getFirebaseUrl();

    if (this.isEnabled && firebaseUrl) {
      if (this.hasPermissionError) {
        pill.className = "system-status-pill danger";
        textEl.textContent = "❌ Firebase 權限遭拒 (需開 Rules)";
      } else if (this.connectionStatus === "online") {
        pill.className = "system-status-pill success pulse";
        textEl.textContent = "🟢 Firebase 雲端同步中";
      } else {
        pill.className = "system-status-pill warning";
        textEl.textContent = "🟡 Firebase 連線中...";
      }
    } else {
      pill.className = "system-status-pill warning";
      textEl.textContent = "🟡 單機模式 (點擊設定)";
    }
  }

  async testFirebaseConnection(customUrlInput = null) {
    const targetUrl = customUrlInput
      ? `${customUrlInput.trim().replace(/\/$/, "")}/ems_inventory_data.json`
      : this.getFirebaseUrl();

    if (!targetUrl) {
      this.connectionStatus = "offline";
      this.updateSyncUIStatus();
      return false;
    }

    try {
      const res = await fetch(targetUrl);
      if (res.ok) {
        this.hasPermissionError = false;
        this.connectionStatus = "online";
        this.updateSyncUIStatus();
        return true;
      } else if (res.status === 401 || res.status === 403) {
        this.hasPermissionError = true;
        this.connectionStatus = "error";
        this.updateSyncUIStatus();
        return false;
      } else {
        this.connectionStatus = "error";
        this.updateSyncUIStatus();
        return false;
      }
    } catch (err) {
      console.warn("[Firebase Connection Test Failed]:", err);
      this.connectionStatus = "error";
      this.updateSyncUIStatus();
      return false;
    }
  }

  notifyLocalTabs() {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type: "DATA_UPDATED", timestamp: Date.now() });
    }
  }

  // Push local data to Firebase — always use current time as updatedAt
  async pushToCloud(showToastMsg = false) {
    this.notifyLocalTabs();
    const firebaseUrl = this.getFirebaseUrl();
    if (!this.isEnabled || !firebaseUrl || this.isSyncing) return;

    this.isSyncing = true;
    const nowTime = Date.now();

    // Lock local timestamp BEFORE the async PUT, so polling won't pull back old data
    localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, nowTime.toString());

    const payload = {
      supplies: store.getSupplies(),
      locations: store.getLocations(),
      users: store.getUsers(),
      reminders: store.getReminderSettings(),
      auditLogs: store.getAuditLogs().slice(0, 50),
      updatedAt: nowTime
    };

    try {
      const res = await fetch(firebaseUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        this.hasPermissionError = false;
        this.connectionStatus = "online";
        this.updateSyncUIStatus();
        if (showToastMsg && typeof showToast === "function") {
          showToast("已成功同步至 Firebase 雲端！", "success");
        }
      } else if (res.status === 401 || res.status === 403) {
        this.hasPermissionError = true;
        this.connectionStatus = "error";
        this.updateSyncUIStatus();
        if (typeof showToast === "function") {
          showToast("【Firebase 權限錯誤】請在 Firebase Console 將 Rules 設定為 .read: true, .write: true", "danger");
        }
      }
    } catch (err) {
      console.warn("[Firebase Push Error]:", err);
    } finally {
      this.isSyncing = false;
    }
  }

  // Pull from Firebase — ONLY apply if cloud data is strictly newer than local
  async pullFromCloud(silent = false) {
    const firebaseUrl = this.getFirebaseUrl();
    if (!this.isEnabled || !firebaseUrl || this.isSyncing) return;

    try {
      const res = await fetch(firebaseUrl);

      if (res.ok) {
        const data = await res.json();
        this.hasPermissionError = false;
        this.connectionStatus = "online";
        this.updateSyncUIStatus();

        if (data && data.supplies && Array.isArray(data.supplies) && data.supplies.length > 0) {
          const lastLocalTime = parseInt(localStorage.getItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME) || "0");
          const cloudTime = data.updatedAt || 0;

          // ONLY overwrite local data if cloud is strictly newer
          // This protects data the user just saved on this device
          if (cloudTime > lastLocalTime) {
            localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(data.supplies));
            if (data.locations) localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(data.locations));
            if (data.users) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
            if (data.reminders) localStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(data.reminders));
            if (data.auditLogs) localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(data.auditLogs));

            localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, cloudTime.toString());

            if (typeof renderAllViews === "function") renderAllViews();
            if (!silent && typeof showToast === "function") {
              showToast("已從 Firebase 雲端同步最新資料！", "success");
            }
          }
        }
      } else if (res.status === 401 || res.status === 403) {
        this.hasPermissionError = true;
        this.connectionStatus = "error";
        this.updateSyncUIStatus();
      }
    } catch (err) {
      console.warn("[Firebase Pull Error]:", err);
    }
  }

  // Polling every 4 seconds
  startRealtimePolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => {
      this.pullFromCloud(true);
    }, 4000);
  }
}

var sync = new CloudSync();
