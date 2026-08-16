/* ==========================================================================
   EMS Consumables Management System - Google Firebase Realtime Cloud Sync Engine
   ========================================================================== */

// ==========================================================================
// 🚨 請在此處貼上您的 Firebase Realtime Database 網址：
// 範例: const FIREBASE_DATABASE_URL = "https://ems-system-default-rtdb.asia-southeast1.firebasedatabase.app";
// ==========================================================================
const FIREBASE_DATABASE_URL = "";

const CLOUD_STORAGE_KEYS = {
  SYNC_ENABLED: "EMS_CLOUD_SYNC_ENABLED",
  LAST_SYNC_TIME: "EMS_LAST_SYNC_TIMESTAMP"
};

class CloudSync {
  constructor() {
    this.isEnabled = localStorage.getItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED) !== "false";
    this.pollInterval = null;
    this.broadcastChannel = null;
    this.isSyncing = false;
    this.hasPermissionError = false;
    
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
    this.updateSyncUIStatus();
    
    if (this.isEnabled && this.getFirebaseUrl()) {
      // Perform initial push first if cloud might be empty, then start pulling
      this.pushToCloud(true).then(() => {
        this.startRealtimePolling();
      });
    }
  }

  getFirebaseUrl() {
    let url = FIREBASE_DATABASE_URL.trim();
    if (!url) return null;
    if (url.endsWith("/")) url = url.slice(0, -1);
    return `${url}/ems_inventory_data.json`;
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

    const firebaseUrl = this.getFirebaseUrl();

    if (this.isEnabled && firebaseUrl) {
      if (this.hasPermissionError) {
        pill.className = "system-status-pill danger";
        textEl.textContent = "❌ Firebase 權限遭拒 (需開啟 Rules)";
      } else {
        pill.className = "system-status-pill success pulse";
        textEl.textContent = `🟢 Firebase 雲端即時同步中`;
      }
    } else {
      pill.className = "system-status-pill warning";
      textEl.textContent = "🟡 本地單機模式 (點擊匯出/載入備份)";
    }
  }

  // Notify other tabs on same device
  notifyLocalTabs() {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type: "DATA_UPDATED", timestamp: Date.now() });
    }
  }

  // Push local state to Google Firebase Realtime Database
  async pushToCloud(showToastMsg = false) {
    this.notifyLocalTabs();
    const firebaseUrl = this.getFirebaseUrl();

    if (!this.isEnabled || !firebaseUrl || this.isSyncing) return;

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
      const res = await fetch(firebaseUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        this.hasPermissionError = false;
        localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, payload.updatedAt.toString());
        this.updateSyncUIStatus();
        if (showToastMsg && typeof showToast === "function") {
          showToast("已成功將資料同步至 Firebase 雲端！", "success");
        }
      } else if (res.status === 401 || res.status === 403) {
        this.hasPermissionError = true;
        this.updateSyncUIStatus();
        console.error("[Firebase Permission Error]: Database rules blocked write access.");
        if (typeof showToast === "function") {
          showToast("【Firebase 警告】雲端資料庫拒絕存取！請在 Firebase Rules 開啟 read/write: true 權限", "danger");
        }
      }
    } catch (err) {
      console.warn("[Firebase Push Error]:", err);
    } finally {
      this.isSyncing = false;
    }
  }

  // Pull latest data from Google Firebase Realtime Database
  async pullFromCloud(silent = false) {
    const firebaseUrl = this.getFirebaseUrl();
    if (!this.isEnabled || !firebaseUrl || this.isSyncing) return;

    try {
      const res = await fetch(firebaseUrl);

      if (res.ok) {
        const data = await res.json();

        // Only overwrite local storage if cloud contains valid supply data
        if (data && data.supplies && Array.isArray(data.supplies) && data.supplies.length > 0) {
          const lastLocalTime = parseInt(localStorage.getItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME) || "0");
          const cloudTime = data.updatedAt || 0;

          if (cloudTime > lastLocalTime) {
            localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(data.supplies));
            if (data.locations) localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(data.locations));
            if (data.users) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
            if (data.reminders) localStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(data.reminders));
            if (data.auditLogs) localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(data.auditLogs));

            localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, cloudTime.toString());
            
            if (typeof renderAllViews === "function") renderAllViews();
            if (!silent && typeof showToast === "function") {
              showToast("已從 Firebase 載入最新資料！", "success");
            }
          }
        }
      }
    } catch (err) {
      console.warn("[Firebase Pull Error]:", err);
    }
  }

  // Realtime polling loop (checks Firebase cloud every 4 seconds)
  startRealtimePolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);

    this.pollInterval = setInterval(() => {
      this.pullFromCloud(true);
    }, 4000);
  }
}

const sync = new CloudSync();
