/* ==========================================================================
   EMS Consumables Management System - Google Firebase Realtime Cloud Sync Engine
   ========================================================================== */

// Default top-level fallback URL (can also be configured dynamically via UI Modal)
const FIREBASE_DATABASE_URL = "https://consumables-management-c7aaa-default-rtdb.asia-southeast1.firebasedatabase.app/";

const CLOUD_STORAGE_KEYS = {
  SYNC_ENABLED: "EMS_CLOUD_SYNC_ENABLED",
  FIREBASE_URL: "EMS_FIREBASE_CUSTOM_URL",
  LAST_SYNC_TIME: "EMS_LAST_SYNC_TIMESTAMP"
};

class CloudSync {
  constructor() {
    this.isEnabled = localStorage.getItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED) !== "false";
    this.pollInterval = null;
    this.broadcastChannel = null;
    this.isSyncing = false;
    this.hasPermissionError = false;
    this.connectionStatus = "offline"; // 'offline', 'online', 'error'
    
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
      this.testFirebaseConnection().then(isOk => {
        if (isOk) {
          this.startRealtimePolling();
        }
      });
    }
  }

  getFirebaseUrl() {
    // 1. Check custom URL saved from UI Modal first
    let customUrl = localStorage.getItem(CLOUD_STORAGE_KEYS.FIREBASE_URL) || "";
    if (!customUrl) {
      customUrl = typeof FIREBASE_DATABASE_URL === "string" ? FIREBASE_DATABASE_URL : "";
    }
    
    let url = customUrl.trim();
    if (!url || url.length < 10) return null;
    if (url.endsWith("/")) url = url.slice(0, -1);
    return `${url}/ems_inventory_data.json`;
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
    if (typeof showToast === "function") showToast("已切換為單機模式 (不使用 Firebase)", "info");
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
        textEl.textContent = `🟢 Firebase 雲端連線正常`;
      } else {
        pill.className = "system-status-pill success";
        textEl.textContent = `🟢 Firebase 雲端設定完畢`;
      }
    } else {
      pill.className = "system-status-pill warning";
      textEl.textContent = "🟡 單機模式 (點擊設定連線/備份)";
    }
  }

  // Active Connection Diagnostic Tester
  async testFirebaseConnection(customUrlInput = null) {
    const targetUrl = customUrlInput ? `${customUrlInput.trim().replace(/\/$/, '')}/ems_inventory_data.json` : this.getFirebaseUrl();
    
    if (!targetUrl) {
      this.connectionStatus = "offline";
      this.updateSyncUIStatus();
      return false;
    }

    try {
      // Send lightweight read ping
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
    const nowTime = Date.now();
    
    // Lock local timestamp immediately
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
          showToast("已成功將衛材資料實時推播至 Firebase 雲端！", "success");
        }
      } else if (res.status === 401 || res.status === 403) {
        this.hasPermissionError = true;
        this.connectionStatus = "error";
        this.updateSyncUIStatus();
        if (typeof showToast === "function") {
          showToast("【Firebase 權限警告】請在 Firebase 控制台將 Rules 設定為 .read: true, .write: true", "danger");
        }
      }
    } catch (err) {
      console.warn("[Firebase Push Error]:", err);
      this.connectionStatus = "error";
      this.updateSyncUIStatus();
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
        this.hasPermissionError = false;
        this.connectionStatus = "online";
        this.updateSyncUIStatus();

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

  // Realtime polling loop (checks Firebase cloud every 4 seconds)
  startRealtimePolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);

    this.pollInterval = setInterval(() => {
      this.pullFromCloud(true);
    }, 4000);
  }
}

const sync = new CloudSync();
