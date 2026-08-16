/* ==========================================================================
   EMS Consumables Management System - State & LocalStorage Store
   ========================================================================== */

const STORAGE_KEYS = {
  SUPPLIES: "EMS_SUPPLIES_DATA_V2",
  USERS: "EMS_USERS_DATA_V2",
  CURRENT_USER_ID: "EMS_ACTIVE_USER_ID_V2",
  REMINDER_SETTINGS: "EMS_REMINDER_SETTINGS_V2",
  OUTBOX_LOGS: "EMS_OUTBOX_LOGS_V2",
  AUDIT_LOGS: "EMS_AUDIT_LOGS_V2",
  THEME: "EMS_THEME_PREF",
  LOCATIONS: "EMS_LOCATIONS_DATA_V2"
};

class Store {
  constructor() {
    this.init();
  }

  init() {
    // 1. Initialize Supplies
    if (!localStorage.getItem(STORAGE_KEYS.SUPPLIES)) {
      localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(INITIAL_MOCK_SUPPLIES));
    }

    // 2. Initialize Users
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_MOCK_USERS));
    }

    // 3. Initialize Active User ID
    if (!localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID)) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, INITIAL_MOCK_USERS[0].id);
    }

    // 4. Initialize Locations
    if (!localStorage.getItem(STORAGE_KEYS.LOCATIONS)) {
      localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(INITIAL_MOCK_LOCATIONS));
    }

    // 5. Initialize Reminder Settings
    if (!localStorage.getItem(STORAGE_KEYS.REMINDER_SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(INITIAL_REMINDER_SETTINGS));
    }

    // 6. Initialize Outbox & Audit Logs
    if (!localStorage.getItem(STORAGE_KEYS.OUTBOX_LOGS)) {
      localStorage.setItem(STORAGE_KEYS.OUTBOX_LOGS, JSON.stringify([]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS)) {
      const initialLogs = [
        {
          id: "log-1",
          timestamp: new Date().toLocaleString("zh-TW"),
          user: "張小明隊員",
          action: "系統初始化",
          details: "載入救護衛材預設庫存與自動效期提醒模組",
          change: "--"
        }
      ];
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(initialLogs));
    }
  }


  // Hard Purge method for cleanup
  purgeTargetLocation(targetName) {
    const cleanTarget = (targetName || "").replace(/\\/g, "").trim();

    // 1. Purge from Locations array
    let locations = this.getLocations();
    const initialLocLen = locations.length;
    locations = locations.filter(l => {
      const k = (l.key || "").replace(/\\/g, "").trim();
      const t = (l.title || "").replace(/\\/g, "").trim();
      return k !== cleanTarget && t !== cleanTarget;
    });

    if (locations.length !== initialLocLen) {
      localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(locations));
    }

    // 2. Reassign supplies from purged location to 2樓大倉
    let supplies = this.getSupplies();
    const defaultLoc = locations.length > 0 ? locations[0].key : "2樓大倉";
    let updated = false;

    supplies.forEach(s => {
      const sLoc = (s.location || "").replace(/\\/g, "").trim();
      if (sLoc === cleanTarget) {
        s.location = defaultLoc;
        updated = true;
      }
    });

    if (updated) {
      localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(supplies));
    }
  }

  // Helper trigger sync after data mutation (silent — no toast popup on routine saves)
  triggerSync() {
    if (window.sync) {
      sync.pushToCloud(false);
    }
  }

  // --- Locations CRUD ---
  getLocations() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCATIONS) || "[]");
  }

  saveLocation(locObj) {
    const locations = this.getLocations();
    const existingIndex = locations.findIndex(l => l.key === locObj.key);

    if (existingIndex !== -1) {
      locations[existingIndex] = { ...locations[existingIndex], ...locObj };
    } else {
      locations.push(locObj);
    }

    localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(locations));

    const currentUser = this.getCurrentUser();
    this.addAuditLog(currentUser.name, "新增救護車/分區位置", `新增庫位【${locObj.title}】`, "+1 位置");
    this.triggerSync();
    return locObj;
  }

  deleteLocation(locKey) {
    let locations = this.getLocations();
    const cleanKey = (locKey || "").replace(/\\/g, "").trim();

    // Flexible matching ignoring trailing backslashes or spaces
    const targetIndex = locations.findIndex(l => {
      const k = (l.key || "").replace(/\\/g, "").trim();
      const t = (l.title || "").replace(/\\/g, "").trim();
      return k === cleanKey || t === cleanKey || l.key === locKey || l.title === locKey;
    });

    if (targetIndex !== -1) {
      locations.splice(targetIndex, 1);
    } else {
      // Force filter matching name ignoring backslashes
      locations = locations.filter(l => (l.key || "").replace(/\\/g, "").trim() !== cleanKey);
    }

    localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(locations));

    // Reassign supplies from deleted location to default location (2樓大倉)
    const supplies = this.getSupplies();
    const defaultLoc = locations.length > 0 ? locations[0].key : "2樓大倉";
    let reassignedCount = 0;

    supplies.forEach(s => {
      const sLocClean = (s.location || "").replace(/\\/g, "").trim();
      if (sLocClean === cleanKey || s.location === locKey) {
        s.location = defaultLoc;
        reassignedCount++;
      }
    });

    if (reassignedCount > 0) {
      localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(supplies));
    }

    const currentUser = this.getCurrentUser();
    this.addAuditLog(
      currentUser.name,
      "移除救護車/分區位置",
      `移除庫位【${locKey}】${reassignedCount > 0 ? `(原有的 ${reassignedCount} 筆耗材已自動併入 [${defaultLoc}])` : ''}`,
      "-1 位置"
    );
    this.triggerSync();
    return true;
  }

  // --- Supplies CRUD ---
  getSupplies() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SUPPLIES) || "[]");
  }

  saveSupply(supplyData) {
    const supplies = this.getSupplies();
    let isEdit = false;

    if (supplyData.id) {
      // Edit existing
      const index = supplies.findIndex(s => s.id === supplyData.id);
      if (index !== -1) {
        supplies[index] = { ...supplies[index], ...supplyData };
        isEdit = true;
      }
    } else {
      // New Supply
      supplyData.id = "sup-" + Date.now();
      supplies.unshift(supplyData);
    }

    localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(supplies));
    
    // Log Audit
    const currentUser = this.getCurrentUser();
    this.addAuditLog(
      currentUser.name,
      isEdit ? "編輯耗材" : "新增耗材",
      `${supplyData.name} (${supplyData.location})`,
      `數量: ${supplyData.quantity} ${supplyData.unit}`
    );

    this.triggerSync();
    return supplyData;
  }

  deleteSupply(supplyId) {
    let supplies = this.getSupplies();
    const target = supplies.find(s => s.id === supplyId);
    if (!target) return false;

    supplies = supplies.filter(s => s.id !== supplyId);
    localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(supplies));

    const currentUser = this.getCurrentUser();
    this.addAuditLog(currentUser.name, "刪除耗材", `${target.name} [批號:${target.batch}]`, "-");
    this.triggerSync();
    return true;
  }

  batchDeleteSupplies(supplyIds) {
    let supplies = this.getSupplies();
    const initialCount = supplies.length;
    supplies = supplies.filter(s => !supplyIds.includes(s.id));
    const deletedCount = initialCount - supplies.length;

    localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(supplies));

    const currentUser = this.getCurrentUser();
    this.addAuditLog(currentUser.name, "批量刪除耗材", `批量成功刪除 ${deletedCount} 筆耗材`, `-${deletedCount} 筆`);
    this.triggerSync();
    return deletedCount;
  }

  // --- Location Transfer Functionality ---
  transferSupplyQuantity(supplyId, targetLocation, transferQty) {
    const supplies = this.getSupplies();
    const sourceItem = supplies.find(s => s.id === supplyId);
    if (!sourceItem) return { success: false, message: "找不到該項耗材資料" };

    if (sourceItem.location === targetLocation) {
      return { success: false, message: "來源庫位與目標庫位相同，無須轉移" };
    }

    const currentQty = sourceItem.quantity;
    if (transferQty > currentQty || transferQty <= 0) {
      return { success: false, message: "轉移數量超出庫存或數量無效" };
    }

    const oldLoc = sourceItem.location;
    const currentUser = this.getCurrentUser();

    if (transferQty === currentQty) {
      // FULL TRANSFER -> Update source item location directly
      sourceItem.location = targetLocation;
      localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(supplies));

      this.addAuditLog(
        currentUser.name,
        "耗材庫位轉移",
        `【全部轉移】${sourceItem.name} (${currentQty} ${sourceItem.unit}) 從 [${oldLoc}] 轉移至 [${targetLocation}]`,
        `庫位轉移`
      );
      this.triggerSync();
      return { success: true, mode: "full", name: sourceItem.name, count: currentQty, oldLoc, targetLocation };
    } else {
      // PARTIAL TRANSFER
      sourceItem.quantity -= transferQty;

      let targetItem = supplies.find(s => 
        s.name === sourceItem.name && 
        s.location === targetLocation && 
        s.batch === sourceItem.batch && 
        s.expiry === sourceItem.expiry
      );

      if (targetItem) {
        targetItem.quantity += transferQty;
      } else {
        targetItem = {
          id: "sup-tr-" + Date.now(),
          name: sourceItem.name,
          category: sourceItem.category,
          batch: sourceItem.batch,
          expiry: sourceItem.expiry,
          quantity: transferQty,
          minStock: sourceItem.minStock,
          unit: sourceItem.unit,
          location: targetLocation,
          notes: sourceItem.notes ? `${sourceItem.notes} (從 ${oldLoc} 轉移)` : `從 ${oldLoc} 轉移部分衛材`
        };
        supplies.unshift(targetItem);
      }

      localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(supplies));

      this.addAuditLog(
        currentUser.name,
        "耗材庫位轉移",
        `【部分轉移】${sourceItem.name} (${transferQty} ${sourceItem.unit}) 從 [${oldLoc}] 轉移至 [${targetLocation}]`,
        `-${transferQty} / +${transferQty}`
      );
      this.triggerSync();
      return { success: true, mode: "partial", name: sourceItem.name, count: transferQty, oldLoc, targetLocation };
    }
  }

  batchTransferSupplies(supplyIds, targetLocation) {
    const supplies = this.getSupplies();
    let transferredCount = 0;

    supplyIds.forEach(id => {
      const item = supplies.find(s => s.id === id);
      if (item && item.location !== targetLocation) {
        item.location = targetLocation;
        transferredCount++;
      }
    });

    localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(supplies));

    const currentUser = this.getCurrentUser();
    this.addAuditLog(
      currentUser.name,
      "批量庫位轉移",
      `批量將 ${transferredCount} 筆耗材全部轉移至 [${targetLocation}]`,
      `${transferredCount} 筆`
    );
    this.triggerSync();
    return transferredCount;
  }

  batchImportSupplies(importedList) {
    const supplies = this.getSupplies();
    const now = Date.now();
    
    importedList.forEach((item, idx) => {
      item.id = `sup-imp-${now}-${idx}`;
      supplies.unshift(item);
    });

    localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(supplies));

    const currentUser = this.getCurrentUser();
    this.addAuditLog(
      currentUser.name,
      "Excel 批次匯入",
      `成功匯入 ${importedList.length} 筆救護衛材數據`,
      `+${importedList.length} 筆`
    );
    this.triggerSync();
  }

  // --- Users & RBAC ---
  getUsers() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "[]");
  }

  getCurrentUser() {
    const currentId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
    const users = this.getUsers();
    return users.find(u => u.id === currentId) || users[0];
  }

  setCurrentUser(userId) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, userId);
  }

  saveUser(userData) {
    const users = this.getUsers();
    if (userData.id) {
      const idx = users.findIndex(u => u.id === userData.id);
      if (idx !== -1) users[idx] = { ...users[idx], ...userData };
    } else {
      userData.id = "usr-" + Date.now();
      users.push(userData);
    }

    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));

    const currentUser = this.getCurrentUser();
    this.addAuditLog(currentUser.name, "更新管理人員", `${userData.name} (${userData.role})`, "--");
    this.triggerSync();
    return userData;
  }

  deleteUser(userId) {
    let users = this.getUsers();
    users = users.filter(u => u.id !== userId);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    this.triggerSync();
  }

  // --- Reminder Settings ---
  getReminderSettings() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.REMINDER_SETTINGS) || "{}");
  }

  saveReminderSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(settings));
    
    const currentUser = this.getCurrentUser();
    this.addAuditLog(currentUser.name, "更新提醒規則", `提醒天數區間: [${settings.intervals.join(', ')}] 天前`, "--");
    this.triggerSync();
  }

  // --- Outbox & Audit Logs ---
  getOutboxLogs() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.OUTBOX_LOGS) || "[]");
  }

  addOutboxLog(subject, recipients, body, status = "Success") {
    const logs = this.getOutboxLogs();
    logs.unshift({
      id: "mail-" + Date.now(),
      timestamp: new Date().toLocaleString("zh-TW"),
      subject,
      recipients: Array.isArray(recipients) ? recipients.join(", ") : recipients,
      body,
      status
    });
    localStorage.setItem(STORAGE_KEYS.OUTBOX_LOGS, JSON.stringify(logs));
  }

  clearOutboxLogs() {
    localStorage.setItem(STORAGE_KEYS.OUTBOX_LOGS, JSON.stringify([]));
  }

  getAuditLogs() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS) || "[]");
  }

  addAuditLog(user, action, details, change) {
    const logs = this.getAuditLogs();
    logs.unshift({
      id: "log-" + Date.now(),
      timestamp: new Date().toLocaleString("zh-TW"),
      user,
      action,
      details,
      change
    });
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs));
  }

  clearAuditLogs() {
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify([]));
  }
}

// Export singleton instance
const store = new Store();
