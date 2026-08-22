/* ==========================================================================
   EMS Consumables Management System - Firebase Realtime Cloud Sync Engine
   Version: 2.3 (Robust Multi-Device Realtime Sync & Queue)
   ========================================================================== */

// Firebase Realtime Database URL
var FIREBASE_DATABASE_URL = "https://consumables-management-c7aaa-default-rtdb.asia-southeast1.firebasedatabase.app";

var CLOUD_STORAGE_KEYS = {
  SYNC_ENABLED: "EMS_CLOUD_SYNC_ENABLED",
  FIREBASE_URL: "EMS_FIREBASE_CUSTOM_URL",
  LAST_SYNC_TIME: "EMS_LAST_SYNC_TIMESTAMP"
};

var CloudSync = (function () {
  function CloudSync() {
    this.pollInterval = null;
    this.isSyncing = false;
    this.pendingPush = false;
    this.hasPermissionError = false;
    this.connectionStatus = "offline";
    this.lastPushTime = null;
    this.lastPullTime = null;
    this.lastSyncedCloudTime = parseInt(localStorage.getItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME) || "0");

    localStorage.setItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED, "true");
    this.isEnabled = true;

    var self = this;
    if (window.BroadcastChannel) {
      this.broadcastChannel = new BroadcastChannel("ems_inventory_sync_channel");
      this.broadcastChannel.onmessage = function (event) {
        if (event.data && event.data.type === "DATA_UPDATED") {
          if (typeof renderAllViews === "function") renderAllViews();
        }
      };
    }
  }

  CloudSync.prototype.getFirebaseUrl = function (authToken) {
    var custom = (localStorage.getItem(CLOUD_STORAGE_KEYS.FIREBASE_URL) || "").trim();
    var base = custom || FIREBASE_DATABASE_URL;
    base = base.trim();
    if (!base || base.length < 10) return null;
    if (base.charAt(base.length - 1) === "/") base = base.slice(0, -1);
    var url = base + "/ems_inventory_data.json";
    if (authToken) {
      url += "?auth=" + encodeURIComponent(authToken);
    }
    return url;
  };

  CloudSync.prototype.init = function () {
    var self = this;
    this.updateSyncUIStatus();
    var url = this.getFirebaseUrl();
    if (!url) return;

    // Pull immediately on startup
    this.pullFromCloud(true).then(function () {
      self.startPolling();
    });
  };

  CloudSync.prototype.updateSyncUIStatus = function () {
    var pill = document.getElementById("cloudSyncPill");
    var textEl = document.getElementById("cloudSyncStatusText");
    if (!pill || !textEl) return;

    if (this.hasPermissionError) {
      pill.className = "system-status-pill danger";
      textEl.textContent = "❌ 權限遭拒 (請確認已登入)";
    } else if (this.connectionStatus === "online") {
      var timeStr = this.lastPushTime ? (" · " + this.lastPushTime) : "";
      pill.className = "system-status-pill success pulse";
      textEl.textContent = "🟢 雲端已連線" + timeStr;
    } else if (this.connectionStatus === "error") {
      pill.className = "system-status-pill danger";
      textEl.textContent = "🔴 連線異常";
    } else {
      pill.className = "system-status-pill warning";
      textEl.textContent = "🟡 連線中...";
    }
  };

  // ── PUSH: Send local data to Firebase ─────────────────────────────────
  CloudSync.prototype.pushToCloud = async function (showToast) {
    var self = this;

    // If a sync is currently in-flight, queue a subsequent push
    if (this.isSyncing) {
      this.pendingPush = true;
      return false;
    }

    var token = null;
    if (typeof authManager !== "undefined") {
      try {
        token = await authManager.getCurrentIdToken();
      } catch (e) {
        console.warn("[CloudSync] Could not get auth token:", e);
      }
    }

    var url = this.getFirebaseUrl(token);
    if (!url) return false;

    this.isSyncing = true;
    var nowTime = Date.now();

    var payload = JSON.stringify({
      supplies: store.getSupplies(),
      locations: store.getLocations(),
      users: store.getUsers(),
      reminders: store.getReminderSettings(),
      auditLogs: store.getAuditLogs().slice(0, 50),
      updatedAt: nowTime
    });

    try {
      var res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload
      });

      self.isSyncing = false;

      if (res.ok) {
        self.hasPermissionError = false;
        self.connectionStatus = "online";
        self.lastSyncedCloudTime = nowTime;
        localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, String(nowTime));

        var d = new Date(nowTime);
        self.lastPushTime = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
        self.updateSyncUIStatus();

        if (showToast && typeof window.showToast === "function") {
          window.showToast("✅ 已成功同步至 Firebase 雲端！", "success");
        }
        if (self.broadcastChannel) {
          self.broadcastChannel.postMessage({ type: "DATA_UPDATED", timestamp: nowTime });
        }

        // If another mutation occurred while in flight, execute it now
        if (self.pendingPush) {
          self.pendingPush = false;
          setTimeout(function () { self.pushToCloud(false); }, 100);
        }

        return true;
      } else if (res.status === 401 || res.status === 403) {
        self.hasPermissionError = true;
        self.connectionStatus = "error";
        self.updateSyncUIStatus();
        if (typeof window.showToast === "function") {
          window.showToast("❌ 雲端寫入遭拒：請確認已使用授權管理員帳號登入", "danger");
        }
        return false;
      } else {
        self.connectionStatus = "error";
        self.updateSyncUIStatus();
        return false;
      }
    } catch (err) {
      self.isSyncing = false;
      self.connectionStatus = "error";
      self.updateSyncUIStatus();
      console.error("[Firebase Push Error]:", err);
      return false;
    }
  };

  // ── PULL: Fetch latest data from Firebase ──────────────────────────────
  CloudSync.prototype.pullFromCloud = async function (silent) {
    var self = this;
    if (this.isSyncing) return false; // Do not pull if we are currently pushing

    var token = null;
    if (typeof authManager !== "undefined") {
      try {
        token = await authManager.getCurrentIdToken();
      } catch (e) {}
    }

    var url = this.getFirebaseUrl(token);
    if (!url) return false;

    try {
      var res = await fetch(url);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          self.hasPermissionError = true;
          self.connectionStatus = "error";
          self.updateSyncUIStatus();
        }
        return false;
      }

      var data = await res.json();
      self.hasPermissionError = false;
      self.connectionStatus = "online";
      self.updateSyncUIStatus();

      if (!data || !data.supplies || !Array.isArray(data.supplies)) {
        return false;
      }

      var cloudTime = data.updatedAt || 0;
      var localSupplies = store.getSupplies();

      // Multi-device sync condition:
      // 1. Cloud timestamp differs from our last applied timestamp
      // 2. OR supplies count differs
      // 3. OR we haven't synced yet in this session
      var shouldApply = false;
      if (cloudTime !== self.lastSyncedCloudTime) {
        shouldApply = true;
      } else if (data.supplies.length !== localSupplies.length) {
        shouldApply = true;
      }

      if (shouldApply && data.supplies.length > 0) {
        localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(data.supplies));
        if (data.locations && Array.isArray(data.locations)) {
          localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(data.locations));
        }
        if (data.users && Array.isArray(data.users)) {
          localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
        }
        if (data.reminders && typeof data.reminders === "object") {
          localStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(data.reminders));
        }
        if (data.auditLogs && Array.isArray(data.auditLogs)) {
          localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(data.auditLogs));
        }

        self.lastSyncedCloudTime = cloudTime;
        localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, String(cloudTime));

        if (typeof renderAllViews === "function") {
          renderAllViews();
        }

        if (!silent && typeof window.showToast === "function") {
          window.showToast("已從 Firebase 雲端同步最新衛材資料！", "success");
        }
        return true;
      }
      return false;
    } catch (err) {
      console.warn("[Firebase Pull Error]:", err);
      return false;
    }
  };

  CloudSync.prototype.startPolling = function () {
    var self = this;
    if (this.pollInterval) clearInterval(this.pollInterval);
    // Poll every 3 seconds for realtime multi-device sync
    this.pollInterval = setInterval(function () {
      self.pullFromCloud(true);
    }, 3000);
  };

  CloudSync.prototype.setCustomFirebaseUrl = function (url) {
    var clean = (url || "").trim().replace(/\/$/, "");
    localStorage.setItem(CLOUD_STORAGE_KEYS.FIREBASE_URL, clean);
    this.isEnabled = true;
    this.updateSyncUIStatus();
  };

  CloudSync.prototype.disableSync = function () {
    this.isEnabled = false;
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.connectionStatus = "offline";
    this.updateSyncUIStatus();
    if (typeof window.showToast === "function") window.showToast("已切換為單機模式", "info");
  };

  CloudSync.prototype.testFirebaseConnection = async function (customUrl) {
    var self = this;
    var token = null;
    if (typeof authManager !== "undefined") {
      try { token = await authManager.getCurrentIdToken(); } catch (e) {}
    }

    var targetUrl = customUrl
      ? customUrl.trim().replace(/\/$/, "") + "/ems_inventory_data.json"
      : this.getFirebaseUrl(token);
    if (!targetUrl) return false;

    try {
      var res = await fetch(targetUrl);
      if (res.ok) {
        self.hasPermissionError = false;
        self.connectionStatus = "online";
        self.updateSyncUIStatus();
        return true;
      } else if (res.status === 401 || res.status === 403) {
        self.hasPermissionError = true;
        self.connectionStatus = "error";
        self.updateSyncUIStatus();
        return false;
      }
      self.connectionStatus = "error";
      self.updateSyncUIStatus();
      return false;
    } catch (err) {
      self.connectionStatus = "error";
      self.updateSyncUIStatus();
      return false;
    }
  };

  return CloudSync;
})();

var sync = new CloudSync();
