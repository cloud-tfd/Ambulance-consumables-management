/* ==========================================================================
   EMS Consumables Management System - Firebase Realtime Cloud Sync Engine
   Version: 2.1 (Simplified & Reliable)
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
    this.hasPermissionError = false;
    this.connectionStatus = "offline";
    this.lastPushTime = null;
    this.lastPullTime = null;

    // Always enable sync when URL is hardcoded
    localStorage.setItem(CLOUD_STORAGE_KEYS.SYNC_ENABLED, "true");
    this.isEnabled = true;

    // Same-device tab sync
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

  CloudSync.prototype.getFirebaseUrl = function () {
    var custom = (localStorage.getItem(CLOUD_STORAGE_KEYS.FIREBASE_URL) || "").trim();
    var base = custom || FIREBASE_DATABASE_URL;
    base = base.trim();
    if (!base || base.length < 10) return null;
    if (base.charAt(base.length - 1) === "/") base = base.slice(0, -1);
    return base + "/ems_inventory_data.json";
  };

  CloudSync.prototype.init = function () {
    var self = this;
    this.updateSyncUIStatus();
    var url = this.getFirebaseUrl();
    if (!url) return;

    // On startup: pull from cloud if cloud is newer, then start polling
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
      textEl.textContent = "❌ Firebase 權限錯誤 (請開 Rules)";
    } else if (this.connectionStatus === "online") {
      var timeStr = this.lastPushTime ? (" · " + this.lastPushTime) : "";
      pill.className = "system-status-pill success pulse";
      textEl.textContent = "🟢 雲端同步中" + timeStr;
    } else if (this.connectionStatus === "error") {
      pill.className = "system-status-pill danger";
      textEl.textContent = "🔴 Firebase 連線錯誤";
    } else {
      pill.className = "system-status-pill warning";
      textEl.textContent = "🟡 連線中...";
    }
  };

  // ── PUSH: Send all local data to Firebase ──────────────────────────────
  CloudSync.prototype.pushToCloud = function (showToast) {
    var self = this;
    var url = this.getFirebaseUrl();
    if (!url || this.isSyncing) return Promise.resolve(false);

    this.isSyncing = true;
    var nowTime = Date.now();
    // Record local push time BEFORE the async request
    localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, String(nowTime));

    var payload = JSON.stringify({
      supplies: store.getSupplies(),
      locations: store.getLocations(),
      users: store.getUsers(),
      reminders: store.getReminderSettings(),
      auditLogs: store.getAuditLogs().slice(0, 50),
      updatedAt: nowTime
    });

    return fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: payload
    }).then(function (res) {
      self.isSyncing = false;
      if (res.ok) {
        self.hasPermissionError = false;
        self.connectionStatus = "online";
        var d = new Date(nowTime);
        self.lastPushTime = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
        self.updateSyncUIStatus();
        if (showToast && typeof window.showToast === "function") {
          window.showToast("✅ 已推送至 Firebase 雲端！", "success");
        }
        // Notify same-device tabs
        if (self.broadcastChannel) {
          self.broadcastChannel.postMessage({ type: "DATA_UPDATED", timestamp: nowTime });
        }
        return true;
      } else if (res.status === 401 || res.status === 403) {
        self.hasPermissionError = true;
        self.connectionStatus = "error";
        self.updateSyncUIStatus();
        if (typeof window.showToast === "function") {
          window.showToast("❌ Firebase 權限拒絕！請在 Firebase Console 開啟 Rules", "danger");
        }
        return false;
      } else {
        self.connectionStatus = "error";
        self.updateSyncUIStatus();
        return false;
      }
    }).catch(function (err) {
      self.isSyncing = false;
      self.connectionStatus = "error";
      self.updateSyncUIStatus();
      console.error("[Firebase Push Error]:", err);
      return false;
    });
  };

  // ── PULL: Fetch latest data from Firebase ──────────────────────────────
  CloudSync.prototype.pullFromCloud = function (silent) {
    var self = this;
    var url = this.getFirebaseUrl();
    if (!url) return Promise.resolve(false);

    return fetch(url).then(function (res) {
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          self.hasPermissionError = true;
          self.connectionStatus = "error";
          self.updateSyncUIStatus();
        }
        return false;
      }
      return res.json().then(function (data) {
        self.hasPermissionError = false;
        self.connectionStatus = "online";
        self.updateSyncUIStatus();

        if (!data || !data.supplies || !Array.isArray(data.supplies) || data.supplies.length === 0) {
          return false;
        }

        var lastLocalTime = parseInt(localStorage.getItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME) || "0");
        var cloudTime = data.updatedAt || 0;

        // Apply cloud data only if cloud is strictly newer than last known sync
        if (cloudTime > lastLocalTime) {
          localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(data.supplies));
          if (data.locations) localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(data.locations));
          if (data.users) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
          if (data.reminders) localStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(data.reminders));
          if (data.auditLogs) localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(data.auditLogs));

          localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, String(cloudTime));

          if (typeof renderAllViews === "function") renderAllViews();
          if (!silent && typeof window.showToast === "function") {
            window.showToast("已從 Firebase 同步最新資料！", "success");
          }
          return true;
        }
        return false;
      });
    }).catch(function (err) {
      console.warn("[Firebase Pull Error]:", err);
      return false;
    });
  };

  CloudSync.prototype.startPolling = function () {
    var self = this;
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(function () {
      self.pullFromCloud(true);
    }, 4000);
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

  CloudSync.prototype.testFirebaseConnection = function (customUrl) {
    var self = this;
    var targetUrl = customUrl
      ? customUrl.trim().replace(/\/$/, "") + "/ems_inventory_data.json"
      : this.getFirebaseUrl();
    if (!targetUrl) return Promise.resolve(false);

    return fetch(targetUrl).then(function (res) {
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
    }).catch(function (err) {
      self.connectionStatus = "error";
      self.updateSyncUIStatus();
      return false;
    });
  };

  return CloudSync;
})();

// Use var so window.sync is properly set (const/let do NOT set window properties)
var sync = new CloudSync();
