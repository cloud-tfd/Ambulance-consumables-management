/* ==========================================================================
   EMS Consumables Management System - Main Application Controller
   ========================================================================== */

let currentSortField = "expiry";
let currentSortOrder = "asc";
let healthChartInstance = null;
let selectedSupplyIds = new Set();
let currentTransferSourceQty = 0;

// Initialize App on DOM Loaded
document.addEventListener("DOMContentLoaded", () => {
  initLucideIcons();
  initThemePref();
  sync.init();
  renderAllViews();
  setupEventListeners();

  // Request Browser Push Notification permission if available
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
});

function initLucideIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

/**
 * Universal Toast Notification Launcher
 */
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  let iconName = "info";
  if (type === "success") iconName = "check-circle-2";
  if (type === "danger") iconName = "alert-circle";
  if (type === "warning") iconName = "alert-triangle";

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  initLucideIcons();

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(50px)";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Theme Toggle (Dark / Light)
 */
function initThemePref() {
  const pref = localStorage.getItem(STORAGE_KEYS.THEME) || "dark";
  if (pref === "light") {
    document.body.classList.remove("theme-dark");
    document.body.classList.add("theme-light");
    updateThemeToggleUI("light");
  } else {
    document.body.classList.remove("theme-light");
    document.body.classList.add("theme-dark");
    updateThemeToggleUI("dark");
  }
}

function toggleTheme() {
  if (document.body.classList.contains("theme-dark")) {
    document.body.classList.remove("theme-dark");
    document.body.classList.add("theme-light");
    localStorage.setItem(STORAGE_KEYS.THEME, "light");
    updateThemeToggleUI("light");
  } else {
    document.body.classList.remove("theme-light");
    document.body.classList.add("theme-dark");
    localStorage.setItem(STORAGE_KEYS.THEME, "dark");
    updateThemeToggleUI("dark");
  }
  if (healthChartInstance) renderDashboardChart();
}

function updateThemeToggleUI(theme) {
  const icon = document.getElementById("themeIcon");
  const label = document.getElementById("themeLabel");
  if (icon && label) {
    if (theme === "light") {
      icon.setAttribute("data-lucide", "sun");
      label.textContent = "明亮模式";
    } else {
      icon.setAttribute("data-lucide", "moon");
      label.textContent = "深色模式";
    }
    initLucideIcons();
  }
}

/**
 * Tab Navigation System
 */
function switchTab(tabId) {
  const tabs = document.querySelectorAll(".tab-content");
  tabs.forEach(tab => tab.classList.remove("active"));

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add("active");

  const navBtns = document.querySelectorAll(".nav-item");
  navBtns.forEach(btn => {
    if (btn.getAttribute("data-tab") === tabId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Update Page Title
  const titleEl = document.getElementById("pageTitle");
  const subEl = document.getElementById("pageSubtitle");
  if (titleEl && subEl) {
    if (tabId === "tab-dashboard") {
      titleEl.textContent = "總覽儀表板";
      subEl.textContent = "救護耗材數量監控、即期警示與急救包備品統計";
    } else if (tabId === "tab-inventory") {
      titleEl.textContent = "耗材庫存清冊";
      subEl.textContent = "完整衛材清單檢索、效期篩選與車輛車號分類管理";
    } else if (tabId === "tab-locations") {
      titleEl.textContent = "救護車輛與分區配置";
      subEl.textContent = "車輛主包、備包與庫房備品庫存分區監控";
    } else if (tabId === "tab-reminders") {
      titleEl.textContent = "效期提醒與寄信設定";
      subEl.textContent = "自訂提前寄信提醒天數區間、發送時間與收件者";
    } else if (tabId === "tab-users") {
      titleEl.textContent = "人員與權限管理 (RBAC)";
      subEl.textContent = "新增/修改管理人員與分配系統增刪瀏覽權限";
    } else if (tabId === "tab-audit") {
      titleEl.textContent = "異動與領用日誌";
      subEl.textContent = "完整記錄衛材領用、匯入與人員操作歷史";
    }
  }

  renderAllViews();
}

/**
 * Dynamic Dropdowns Sync System
 */
function populateLocationDropdowns() {
  const locations = store.getLocations();

  // 1. Inventory Filter Location Select
  const filterSelect = document.getElementById("filterLocation");
  if (filterSelect) {
    const currentVal = filterSelect.value;
    filterSelect.innerHTML = `
      <option value="ALL">所有放置車輛 / 庫位</option>
      ${locations.map(l => `<option value="${l.key}">${l.title}</option>`).join('')}
    `;
    if (currentVal) filterSelect.value = currentVal;
  }

  // 2. Supply Add/Edit Modal Location Select
  const modalSelect = document.getElementById("supplyLocation");
  if (modalSelect) {
    const currentVal = modalSelect.value;
    modalSelect.innerHTML = locations.map(l => `<option value="${l.key}">${l.title}</option>`).join('');
    if (currentVal) modalSelect.value = currentVal;
  }
}

/**
 * Master View Renderer
 */
function renderAllViews() {
  populateLocationDropdowns();
  rbac.applyPermissionsToUI();
  sync.updateSyncUIStatus();
  renderDashboardStats();
  renderDashboardAlertsTable();
  renderDashboardChart();
  renderInventoryTable();
  renderLocationsGrid();
  renderUsersTable();
  renderReminderSettingsView();
  renderAuditLogsTable();
}

/**
 * Manual Force Push to Firebase (shows explicit success/failure)
 */
function forcePushToCloud() {
  showToast("⏳ 正在推送資料至 Firebase...", "info");
  sync.pushToCloud(true).then(function (ok) {
    if (ok) {
      runSyncDiagnostics();
    } else {
      showToast("❌ 推送失敗，請開啟同步設定確認連線狀態", "danger");
    }
  });
}

/**
 * Cloud Synchronization Modal Handlers & Firebase Tester
 */
function openCloudSyncModal() {
  const inputEl = document.getElementById("firebaseUrlInput");
  const msgEl = document.getElementById("firebaseTestResultMsg");
  if (msgEl) msgEl.innerHTML = "";

  let activeUrl = localStorage.getItem(CLOUD_STORAGE_KEYS.FIREBASE_URL) || "";
  if (!activeUrl) activeUrl = typeof FIREBASE_DATABASE_URL === "string" ? FIREBASE_DATABASE_URL : "";

  if (inputEl) inputEl.value = activeUrl;
  openModal("cloudSyncModal");
  // Auto-run diagnostics on open
  setTimeout(runSyncDiagnostics, 200);
}

async function runSyncDiagnostics() {
  const panel = document.getElementById("syncDiagnosticsPanel");
  if (!panel) return;

  const firebaseUrl = sync.getFirebaseUrl();
  const isEnabled = sync.isEnabled;
  const localCount = store.getSupplies().length;
  const lastSync = localStorage.getItem(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME);
  const lastSyncStr = lastSync ? new Date(parseInt(lastSync)).toLocaleString("zh-TW") : "（從未同步）";

  panel.innerHTML = `
    <div>🔌 同步狀態：<b>${isEnabled ? "✅ 已啟用" : "❌ 已停用 (單機模式)"}</b></div>
    <div>🔗 Firebase 網址：<b style="word-break:break-all">${firebaseUrl || "❌ 未設定"}</b></div>
    <div>📦 本地耗材數量：<b>${localCount} 筆</b></div>
    <div>🕐 上次同步時間：<b>${lastSyncStr}</b></div>
    <div>📡 連線狀態：<b>${sync.connectionStatus === "online" ? "🟢 線上" : sync.connectionStatus === "error" ? "🔴 錯誤" : "🟡 測試中..."}</b></div>
    <hr style="margin:8px 0; opacity:0.3">
    <div id="diagFirebaseResult">⏳ 正在向 Firebase 發送測試請求...</div>
  `;

  if (!firebaseUrl) {
    document.getElementById("diagFirebaseResult").innerHTML = "❌ <b>Firebase 網址未設定</b>，請在上方輸入框貼入網址後點擊「測試並儲存」";
    return;
  }

  try {
    const res = await fetch(firebaseUrl);
    const diagEl = document.getElementById("diagFirebaseResult");
    if (res.ok) {
      const data = await res.json();
      const cloudCount = (data && data.supplies) ? data.supplies.length : 0;
      const cloudTime = (data && data.updatedAt) ? new Date(data.updatedAt).toLocaleString("zh-TW") : "無資料";
      diagEl.innerHTML = `
        ✅ <b>Firebase 連線正常！</b><br>
        ☁️ 雲端耗材數量：<b>${cloudCount} 筆</b><br>
        🕐 雲端最後更新：<b>${cloudTime}</b>
      `;
    } else if (res.status === 401 || res.status === 403) {
      diagEl.innerHTML = `❌ <b>Firebase 權限遭拒 (HTTP ${res.status})</b><br>請前往 Firebase Console → Realtime Database → Rules，將規則改為 .read: true, .write: true`;
    } else {
      diagEl.innerHTML = `⚠️ Firebase 回應錯誤：HTTP ${res.status}`;
    }
  } catch (err) {
    document.getElementById("diagFirebaseResult").innerHTML = `❌ 連線失敗：${err.message}（請確認網路是否正常）`;
  }
}

async function testAndSaveFirebaseUI() {
  const inputEl = document.getElementById("firebaseUrlInput");
  const msgEl = document.getElementById("firebaseTestResultMsg");
  
  const rawUrl = inputEl ? inputEl.value.trim() : "";
  if (!rawUrl) {
    if (msgEl) msgEl.innerHTML = `<span class="text-warning">⚠️ 請輸入有效的 Firebase 網址 (或點擊『切換為單機模式』)</span>`;
    return;
  }

  if (msgEl) msgEl.innerHTML = `<span class="text-accent">⏳ 正在實時連線測試 Firebase 雲端資料庫中...</span>`;

  const isSuccess = await sync.testFirebaseConnection(rawUrl);

  if (isSuccess) {
    sync.setCustomFirebaseUrl(rawUrl);
    sync.pushToCloud(false);
    sync.startRealtimePolling();
    if (msgEl) msgEl.innerHTML = `<span class="text-success">🟢 連線成功！已成功連線至 Firebase 雲端資料庫！</span>`;
    showToast("Firebase 雲端連線成功！異動將實時同步至所有連線裝置", "success");
    setTimeout(() => {
      closeModal("cloudSyncModal");
      renderAllViews();
    }, 1200);
  } else {
    if (sync.hasPermissionError) {
      if (msgEl) msgEl.innerHTML = `<span class="text-danger">❌ 權限遭拒！請在 Firebase 網站將 Rules 改為 ".read": true, ".write": true</span>`;
      showToast("【Firebase 權限警告】Rules 拒絕存取，請在 Firebase 網站開啟 Rules 權限", "danger");
    } else {
      if (msgEl) msgEl.innerHTML = `<span class="text-danger">❌ 連線失敗！請檢查網址格式是否正確 (例: https://xxx.firebaseio.com)</span>`;
      showToast("Firebase 連線失敗，請檢查網址與網路狀態", "warning");
    }
  }
}

function disableCloudSyncUI() {
  localStorage.removeItem(CLOUD_STORAGE_KEYS.FIREBASE_URL);
  sync.disableSync();
  closeModal("cloudSyncModal");
  renderAllViews();
}


/**
 * 1. DASHBOARD VIEW RENDERERS
 */
function renderDashboardStats() {
  const supplies = store.getSupplies();
  const alertItems = getExpiringAndExpiredSuppliesList();
  const settings = store.getReminderSettings();

  const totalItems = supplies.length;
  const categories = new Set(supplies.map(s => s.category)).size;

  const expiredCount = supplies.filter(s => getSupplyStatusInfo(s).isExpired).length;
  
  const intervals = settings.intervals || [30];
  const maxThreshold = Math.max(...intervals, 30);
  const expiringCount = supplies.filter(s => {
    const info = getSupplyStatusInfo(s);
    return !info.isExpired && info.daysLeft <= maxThreshold;
  }).length;

  const lowStockCount = supplies.filter(s => s.quantity <= s.minStock).length;

  document.getElementById("statTotalItems").textContent = totalItems;
  document.getElementById("statTotalCategories").textContent = categories;
  document.getElementById("statExpiredItems").textContent = expiredCount;
  document.getElementById("statExpiringItems").textContent = expiringCount;
  document.getElementById("statThresholdDays").textContent = maxThreshold;
  document.getElementById("statLowStockItems").textContent = lowStockCount;

  // Sidebar badge for expired items
  const badgeEl = document.getElementById("expiredCountBadge");
  if (badgeEl) {
    badgeEl.textContent = expiredCount;
    badgeEl.style.display = expiredCount > 0 ? "inline-block" : "none";
  }
}

function renderDashboardAlertsTable() {
  const alertList = getExpiringAndExpiredSuppliesList();
  const tbody = document.getElementById("dashboardAlertsTable");
  if (!tbody) return;

  if (alertList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-subtitle">
          <i data-lucide="shield-check" class="text-success" style="width: 32px; height: 32px;"></i>
          <p class="mt-2">庫存良好！目前無即期或過期之救護耗材</p>
        </td>
      </tr>
    `;
    initLucideIcons();
    return;
  }

  tbody.innerHTML = alertList.slice(0, 7).map(item => {
    const s = item.supply;
    const info = item.info;

    return `
      <tr>
        <td>
          <strong>${s.name}</strong>
          <div class="text-subtitle">批號: <code>${s.batch || '無'}</code></div>
        </td>
        <td><span class="badge badge-info">${s.location}</span></td>
        <td><strong>${s.expiry}</strong></td>
        <td>${s.quantity} ${s.unit}</td>
        <td><span class="badge ${info.class}">${info.label}</span></td>
        <td>
          <button class="btn btn-sm btn-secondary rbac-add" onclick="openSupplyModal('${s.id}')">
            <i data-lucide="edit-3"></i> 盤點更換
          </button>
        </td>
      </tr>
    `;
  }).join('');

  initLucideIcons();
  rbac.applyPermissionsToUI();
}

function renderDashboardChart() {
  const canvas = document.getElementById("categoryHealthChart");
  if (!canvas) return;

  const supplies = store.getSupplies();
  const categoryCounts = {};

  supplies.forEach(s => {
    categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1;
  });

  const labels = Object.keys(categoryCounts);
  const dataValues = Object.values(categoryCounts);

  if (healthChartInstance) {
    healthChartInstance.destroy();
  }

  const isDark = document.body.classList.contains("theme-dark");
  const textColor = isDark ? "#f8fafc" : "#0f172a";

  healthChartInstance = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: dataValues,
        backgroundColor: [
          "#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#06b6d4"
        ],
        borderWidth: 2,
        borderColor: isDark ? "#1e293b" : "#ffffff"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: textColor, font: { family: "Inter", size: 12 } }
        }
      }
    }
  });
}

/**
 * 2. INVENTORY TABLE RENDERER (WITH BATCH CHECKBOXES & LOCATION TRANSFER)
 */
function renderInventoryTable() {
  const supplies = store.getSupplies();
  const search = document.getElementById("inventorySearchInput")?.value.toLowerCase().trim() || "";
  const catFilter = document.getElementById("filterCategory")?.value || "ALL";
  const locFilter = document.getElementById("filterLocation")?.value || "ALL";
  const statusFilter = document.getElementById("filterStatus")?.value || "ALL";

  // Filter items
  let filtered = supplies.filter(s => {
    const info = getSupplyStatusInfo(s);

    const matchesSearch = s.name.toLowerCase().includes(search) ||
                          (s.batch && s.batch.toLowerCase().includes(search)) ||
                          (s.notes && s.notes.toLowerCase().includes(search));

    const matchesCat = catFilter === "ALL" || s.category === catFilter;
    const matchesLoc = locFilter === "ALL" || s.location === locFilter;

    let matchesStatus = true;
    if (statusFilter === "expired") matchesStatus = info.isExpired;
    if (statusFilter === "expiring") matchesStatus = info.isExpiring;
    if (statusFilter === "safe") matchesStatus = info.status === "safe";
    if (statusFilter === "low_stock") matchesStatus = info.isLowStock || s.quantity <= s.minStock;

    return matchesSearch && matchesCat && matchesLoc && matchesStatus;
  });

  // Sort items
  filtered.sort((a, b) => {
    let valA = a[currentSortField];
    let valB = b[currentSortField];

    if (currentSortField === "expiry") {
      valA = new Date(a.expiry || "9999-12-31").getTime();
      valB = new Date(b.expiry || "9999-12-31").getTime();
    }

    if (valA < valB) return currentSortOrder === "asc" ? -1 : 1;
    if (valA > valB) return currentSortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById("inventoryTableBody");
  const summaryEl = document.getElementById("inventoryTableSummary");
  if (!tbody) return;

  summaryEl.textContent = `共搜尋到 ${filtered.length} 筆救護耗材品項 (總庫存量: ${supplies.length} 筆)`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-5 text-subtitle">
          <i data-lucide="package-x" style="width: 40px; height: 40px; opacity: 0.4;"></i>
          <p class="mt-2">查無符合條件之衛材品項</p>
        </td>
      </tr>
    `;
    initLucideIcons();
    updateBatchDeleteBtnState();
    return;
  }

  tbody.innerHTML = filtered.map(s => {
    const info = getSupplyStatusInfo(s);
    const isChecked = selectedSupplyIds.has(s.id);

    return `
      <tr class="${isChecked ? 'table-active' : ''}">
        <td style="text-align: center;">
          <input type="checkbox" class="supply-select-cb" value="${s.id}" ${isChecked ? 'checked' : ''} onchange="toggleSelectSupplyItem('${s.id}', this.checked)">
        </td>
        <td>
          <strong>${s.name}</strong>
          ${s.notes ? `<div class="form-hint">${s.notes}</div>` : ''}
        </td>
        <td><span class="badge badge-info">${s.category}</span></td>
        <td><code>${s.batch || '無'}</code></td>
        <td><strong>${s.expiry}</strong></td>
        <td><span class="badge badge-info">${s.location}</span></td>
        <td>
          <strong>${s.quantity}</strong> / <span class="text-subtitle">${s.minStock} ${s.unit}</span>
        </td>
        <td><span class="badge ${info.class}">${info.label}</span></td>
        <td class="text-right">
          <button class="btn btn-sm btn-ghost text-accent rbac-add" title="轉移存放區" onclick="openTransferModal('${s.id}')">
            <i data-lucide="arrow-right-left"></i> 轉移
          </button>
          <button class="btn btn-sm btn-ghost rbac-add" title="編輯耗材" onclick="openSupplyModal('${s.id}')">
            <i data-lucide="edit"></i>
          </button>
          <button class="btn btn-sm btn-ghost text-danger rbac-add" title="刪除耗材" onclick="confirmDeleteSupply('${s.id}')">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  initLucideIcons();
  rbac.applyPermissionsToUI();
  updateBatchDeleteBtnState();
}

/**
 * Checkbox Selection & Batch Operations System
 */
function toggleSelectSupplyItem(supplyId, isChecked) {
  if (isChecked) {
    selectedSupplyIds.add(supplyId);
  } else {
    selectedSupplyIds.delete(supplyId);
  }
  updateBatchDeleteBtnState();
}

function toggleSelectAllInventory(masterCb) {
  const cbs = document.querySelectorAll(".supply-select-cb");
  cbs.forEach(cb => {
    cb.checked = masterCb.checked;
    if (masterCb.checked) {
      selectedSupplyIds.add(cb.value);
    } else {
      selectedSupplyIds.delete(cb.value);
    }
  });
  renderInventoryTable();
}

function updateBatchDeleteBtnState() {
  const btnDelete = document.getElementById("btnBatchDelete");
  const btnTransfer = document.getElementById("btnBatchTransfer");
  const countEl = document.getElementById("selectedCount");
  const countTransferEl = document.getElementById("selectedTransferCount");
  const masterCb = document.getElementById("selectAllCheckbox");

  const count = selectedSupplyIds.size;
  if (countEl) countEl.textContent = count;
  if (countTransferEl) countTransferEl.textContent = count;

  const canEdit = rbac.hasPermission("canAddSupply");

  if (btnDelete) btnDelete.style.display = (count > 0 && rbac.hasPermission("canDeleteSupply")) ? "inline-flex" : "none";
  if (btnTransfer) btnTransfer.style.display = (count > 0 && canEdit) ? "inline-flex" : "none";

  const allCbs = document.querySelectorAll(".supply-select-cb");
  if (masterCb && allCbs.length > 0) {
    masterCb.checked = Array.from(allCbs).every(cb => cb.checked);
  }
}

function confirmBatchDeleteSupplies() {
  if (!rbac.checkActionAllowed("canDeleteSupply", "批量刪除耗材")) return;

  const count = selectedSupplyIds.size;
  if (count === 0) return;

  if (confirm(`【警告】確定要刪除已勾選的 ${count} 筆救護衛材項目嗎？刪除後無法恢復。`)) {
    const idsArray = Array.from(selectedSupplyIds);
    const deletedCount = store.batchDeleteSupplies(idsArray);

    selectedSupplyIds.clear();
    const masterCb = document.getElementById("selectAllCheckbox");
    if (masterCb) masterCb.checked = false;

    showToast(`已成功批量刪除 ${deletedCount} 筆救護耗材項目！`, "warning");
    renderAllViews();
  }
}

/**
 * Location Transfer Modal & Logic (Single & Batch)
 */
function openTransferModal(supplyId) {
  if (!rbac.checkActionAllowed("canAddSupply", "耗材庫位轉移")) return;

  const supplies = store.getSupplies();
  const target = supplies.find(s => s.id === supplyId);
  if (!target) return;

  document.getElementById("transferModalTitle").innerHTML = `<i data-lucide="arrow-right-left" class="text-primary"></i> 庫位耗材轉移`;
  document.getElementById("transferSupplyId").value = target.id;
  document.getElementById("transferIsBatch").value = "false";

  // Display Source Item Info
  document.getElementById("transferSourceInfoCard").style.display = "block";
  document.getElementById("transferSingleQtySection").style.display = "block";
  document.getElementById("transferBatchMsgSection").style.display = "none";

  document.getElementById("transferSourceItemName").textContent = target.name;
  document.getElementById("transferSourceLocation").textContent = target.location;
  document.getElementById("transferSourceMaxQty").textContent = target.quantity;
  document.getElementById("transferSourceUnit").textContent = target.unit || "個";

  currentTransferSourceQty = target.quantity;

  const qtyInput = document.getElementById("transferQtyInput");
  qtyInput.max = target.quantity;
  qtyInput.value = target.quantity; // Default to full transfer
  updateTransferQtyModeLabel();

  // Populate Target Location Select (exclude current location)
  const locations = store.getLocations();
  const selectEl = document.getElementById("transferTargetLocation");
  const availableTargets = locations.filter(l => l.key !== target.location);

  if (availableTargets.length === 0) {
    showToast("尚無其他可轉移的庫位，請先至「救護車輛與分區」新增新庫位", "warning");
    return;
  }

  selectEl.innerHTML = availableTargets.map(l => `<option value="${l.key}">${l.title}</option>`).join('');

  openModal("transferModal");
  initLucideIcons();
}

function openBatchTransferModal() {
  if (!rbac.checkActionAllowed("canAddSupply", "批量轉移庫位")) return;

  const count = selectedSupplyIds.size;
  if (count === 0) return;

  document.getElementById("transferModalTitle").innerHTML = `<i data-lucide="arrow-right-left" class="text-primary"></i> 批量轉移庫位 (${count} 筆)`;
  document.getElementById("transferIsBatch").value = "true";

  document.getElementById("transferSourceInfoCard").style.display = "none";
  document.getElementById("transferSingleQtySection").style.display = "none";
  document.getElementById("transferBatchMsgSection").style.display = "block";
  document.getElementById("transferBatchCountText").textContent = count;

  // Populate all Locations
  const locations = store.getLocations();
  const selectEl = document.getElementById("transferTargetLocation");
  selectEl.innerHTML = locations.map(l => `<option value="${l.key}">${l.title}</option>`).join('');

  openModal("transferModal");
  initLucideIcons();
}

function updateTransferQtyModeLabel() {
  const inputVal = parseInt(document.getElementById("transferQtyInput").value) || 0;
  const hintEl = document.getElementById("transferQtyHint");

  if (inputVal >= currentTransferSourceQty) {
    hintEl.innerHTML = `<span class="badge badge-success">全部轉移</span> 原庫位項目將直接更新為新庫位`;
  } else {
    hintEl.innerHTML = `<span class="badge badge-info">部分轉移</span> 原庫位扣減 ${inputVal} 個，新庫位建立/增加 ${inputVal} 個`;
  }
}

function setTransferMaxQty() {
  const qtyInput = document.getElementById("transferQtyInput");
  qtyInput.value = currentTransferSourceQty;
  updateTransferQtyModeLabel();
}

function executeTransferSubmit(event) {
  event.preventDefault();
  if (!rbac.checkActionAllowed("canAddSupply", "執行轉移")) return;

  const isBatch = document.getElementById("transferIsBatch").value === "true";
  const targetLocation = document.getElementById("transferTargetLocation").value;

  if (!targetLocation) {
    showToast("請選擇目標存放區", "warning");
    return;
  }

  if (isBatch) {
    // BATCH TRANSFER
    const idsArray = Array.from(selectedSupplyIds);
    const transferredCount = store.batchTransferSupplies(idsArray, targetLocation);

    selectedSupplyIds.clear();
    const masterCb = document.getElementById("selectAllCheckbox");
    if (masterCb) masterCb.checked = false;

    showToast(`已成功將 ${transferredCount} 筆救護耗材批量轉移至【${targetLocation}】！`, "success");
  } else {
    // SINGLE TRANSFER (Full or Partial)
    const supplyId = document.getElementById("transferSupplyId").value;
    const transferQty = parseInt(document.getElementById("transferQtyInput").value) || 1;

    const res = store.transferSupplyQuantity(supplyId, targetLocation, transferQty);
    if (!res.success) {
      showToast(res.message, "danger");
      return;
    }

    if (res.mode === "full") {
      showToast(`已成功將耗材【${res.name}】全部轉移至【${targetLocation}】`, "success");
    } else {
      showToast(`已成功轉移 ${res.count} 個【${res.name}】從【${res.oldLoc}】至【${targetLocation}】`, "success");
    }
  }

  closeModal("transferModal");
  renderAllViews();
}

function sortInventory(field) {
  if (currentSortField === field) {
    currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
  } else {
    currentSortField = field;
    currentSortOrder = "asc";
  }
  renderInventoryTable();
}

function resetInventoryFilters() {
  if (document.getElementById("inventorySearchInput")) document.getElementById("inventorySearchInput").value = "";
  if (document.getElementById("filterCategory")) document.getElementById("filterCategory").value = "ALL";
  if (document.getElementById("filterLocation")) document.getElementById("filterLocation").value = "ALL";
  if (document.getElementById("filterStatus")) document.getElementById("filterStatus").value = "ALL";
  selectedSupplyIds.clear();
  renderInventoryTable();
}

function filterInventoryByStatus(status) {
  switchTab("tab-inventory");
  document.getElementById("filterStatus").value = status;
  renderInventoryTable();
}

/**
 * 3. LOCATIONS & AMBULANCE BAGS VIEW (DYNAMIC ADD / REMOVE)
 */
function renderLocationsGrid() {
  const supplies = store.getSupplies();
  const locations = store.getLocations();
  const container = document.getElementById("locationCardsContainer");
  if (!container) return;

  if (locations.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5 text-subtitle" style="grid-column: 1 / -1;">
        <i data-lucide="map-pin-off" style="width: 48px; height: 48px; opacity: 0.4;"></i>
        <p class="mt-2">目前尚無配置任何救護車輛或庫房分區</p>
      </div>
    `;
    initLucideIcons();
    return;
  }

  container.innerHTML = locations.map(loc => {
    const items = supplies.filter(s => s.location === loc.key);
    const expiredCount = items.filter(s => getSupplyStatusInfo(s).isExpired).length;

    return `
      <div class="location-card">
        <div class="location-card-header">
          <div class="location-title">
            <i data-lucide="${loc.icon || 'ambulance'}" class="text-primary"></i>
            <div>
              <h3>${loc.title}</h3>
              ${loc.description ? `<span class="text-subtitle" style="font-size:0.75rem;">${loc.description}</span>` : ''}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="badge ${expiredCount > 0 ? 'badge-danger' : 'badge-success'}">
              ${expiredCount > 0 ? `${expiredCount} 項過期` : '狀態正常'}
            </span>
            <button class="btn btn-sm btn-ghost text-danger rbac-add" title="移除此車輛/分區" onclick="confirmDeleteLocation('${loc.key}')">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>

        <div class="mb-3 text-subtitle">存放 ${items.length} 筆核心救護耗材</div>

        <div class="table-responsive">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>耗材</th>
                <th>數量</th>
                <th>到期日</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              ${items.length === 0 ? '<tr><td colspan="4" class="text-center text-subtitle">此處尚未放入耗材</td></tr>' : ''}
              ${items.slice(0, 5).map(s => {
                const info = getSupplyStatusInfo(s);
                return `
                  <tr>
                    <td><strong>${s.name}</strong></td>
                    <td>${s.quantity} ${s.unit}</td>
                    <td>${s.expiry}</td>
                    <td><span class="badge ${info.class}">${info.label}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  initLucideIcons();
  rbac.applyPermissionsToUI();
}

/**
 * Dynamic Location Modal & Logic
 */
function openLocationModal() {
  if (!rbac.checkActionAllowed("canAddSupply", "新增車輛分區")) return;
  document.getElementById("locationForm").reset();
  openModal("locationModal");
}

function saveLocationForm(event) {
  event.preventDefault();
  if (!rbac.checkActionAllowed("canAddSupply", "新增庫位")) return;

  const title = document.getElementById("locTitle").value.trim();
  const icon = document.getElementById("locIcon").value;
  const description = document.getElementById("locDesc").value.trim();

  if (!title) return;

  const locObj = {
    key: title,
    title: title,
    icon: icon,
    description: description
  };

  store.saveLocation(locObj);
  showToast(`已成功新增車輛/分區【${title}】！`, "success");
  closeModal("locationModal");
  renderAllViews();
}

function confirmDeleteLocation(locKey) {
  if (!rbac.checkActionAllowed("canDeleteSupply", "刪除車輛分區")) return;

  const supplies = store.getSupplies();
  const hasSupplies = supplies.some(s => s.location === locKey);

  if (hasSupplies) {
    if (!confirm(`【警告】分區【${locKey}】內尚有耗材品項，確定要移除此分區配置嗎？`)) {
      return;
    }
  } else {
    if (!confirm(`確定要移除分區【${locKey}】嗎？`)) {
      return;
    }
  }

  store.deleteLocation(locKey);
  showToast(`已移除車輛/分區【${locKey}】`, "warning");
  renderAllViews();
}

/**
 * 4. USERS & RBAC VIEW
 */
function renderUsersTable() {
  const users = store.getUsers();
  const tbody = document.getElementById("userTableBody");
  if (!tbody) return;

  tbody.innerHTML = users.map(u => {
    let roleLabel = "最高管理員 (Super Admin)";
    let badgeClass = "badge-danger";
    let roleDesc = ROLES.ADMIN.description;

    if (u.role === "editor") {
      roleLabel = "庫存管理員 (Supply Editor)";
      badgeClass = "badge-info";
      roleDesc = ROLES.EDITOR.description;
    } else if (u.role === "viewer") {
      roleLabel = "救護人員 (EMS Viewer)";
      badgeClass = "badge-purple";
      roleDesc = ROLES.VIEWER.description;
    }

    return `
      <tr>
        <td><strong>${u.name}</strong></td>
        <td><code>${u.email}</code></td>
        <td>${u.dept || '第一救護分隊'}</td>
        <td><span class="badge ${badgeClass}">${roleLabel}</span></td>
        <td style="max-width: 250px;"><span class="text-subtitle">${roleDesc}</span></td>
        <td class="text-right">
          <button class="btn btn-sm btn-ghost rbac-manage-users" onclick="openUserEditModal('${u.id}')">
            <i data-lucide="edit"></i> 編輯
          </button>
          <button class="btn btn-sm btn-ghost text-danger rbac-manage-users" onclick="deleteUser('${u.id}')">
            <i data-lucide="trash-2"></i> 刪除
          </button>
        </td>
      </tr>
    `;
  }).join('');

  initLucideIcons();
  rbac.applyPermissionsToUI();
}

function updateRoleDescriptionHint() {
  const roleVal = document.getElementById("userRole").value;
  const hintContainer = document.getElementById("roleHintText");
  if (!hintContainer) return;

  let desc = ROLES.ADMIN.description;
  if (roleVal === "editor") desc = ROLES.EDITOR.description;
  if (roleVal === "viewer") desc = ROLES.VIEWER.description;

  hintContainer.innerHTML = `<i data-lucide="info"></i> <strong>權限說明：</strong>${desc}`;
  initLucideIcons();
}

/**
 * 5. AUDIT LOGS VIEW
 */
function renderAuditLogsTable() {
  const logs = store.getAuditLogs();
  const tbody = document.getElementById("auditTableBody");
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-subtitle">尚無操作歷史紀錄</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td><code>${l.timestamp}</code></td>
      <td><strong>${l.user}</strong></td>
      <td><span class="badge badge-info">${l.action}</span></td>
      <td>${l.details}</td>
      <td><code>${l.change}</code></td>
    </tr>
  `).join('');
}

function clearAuditLogs() {
  store.clearAuditLogs();
  showToast("已清空操作日誌履歷", "info");
  renderAuditLogsTable();
}

/**
 * MODAL LOGIC & FORM SUBMISSIONS
 */
function openModal(modalId) {
  document.getElementById(modalId)?.classList.add("active");
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove("active");
}

// Supply Modal
function openSupplyModal(supplyId = null) {
  if (!rbac.checkActionAllowed("canAddSupply", "衛材維護")) return;

  populateLocationDropdowns();
  const form = document.getElementById("supplyForm");
  form.reset();

  if (supplyId) {
    const supplies = store.getSupplies();
    const target = supplies.find(s => s.id === supplyId);
    if (target) {
      document.getElementById("supplyModalTitle").textContent = "編輯救護耗材資料";
      document.getElementById("supplyId").value = target.id;
      document.getElementById("supplyName").value = target.name;
      document.getElementById("supplyCategory").value = target.category || "呼吸道急救";
      document.getElementById("supplyBatch").value = target.batch || "";
      document.getElementById("supplyExpiry").value = target.expiry;
      document.getElementById("supplyLocation").value = target.location || "2樓大倉";
      document.getElementById("supplyQuantity").value = target.quantity;
      document.getElementById("supplyMinStock").value = target.minStock || 5;
      document.getElementById("supplyUnit").value = target.unit || "個";
      document.getElementById("supplyNotes").value = target.notes || "";
    }
  } else {
    document.getElementById("supplyModalTitle").textContent = "新增救護耗材";
    document.getElementById("supplyId").value = "";
    document.getElementById("supplyExpiry").value = getRelativeDate(180);
    document.getElementById("supplyQuantity").value = 1;
    document.getElementById("supplyMinStock").value = 5;
    document.getElementById("supplyUnit").value = "個";
  }

  openModal("supplyModal");
}

function saveSupply(event) {
  event.preventDefault();
  if (!rbac.checkActionAllowed("canAddSupply", "儲存衛材")) return;

  const rawMinStock = document.getElementById("supplyMinStock").value;
  const locations = store.getLocations();
  const defaultLoc = locations.length > 0 ? locations[0].key : "2樓大倉";

  const supplyData = {
    id: document.getElementById("supplyId").value,
    name: document.getElementById("supplyName").value.trim(),
    expiry: document.getElementById("supplyExpiry").value,
    quantity: parseInt(document.getElementById("supplyQuantity").value) || 0,
    category: document.getElementById("supplyCategory").value || "呼吸道急救",
    batch: document.getElementById("supplyBatch").value.trim() || "無",
    location: document.getElementById("supplyLocation").value || defaultLoc,
    minStock: parseInt(rawMinStock) || 5,
    unit: document.getElementById("supplyUnit").value.trim() || "個",
    notes: document.getElementById("supplyNotes").value.trim()
  };

  store.saveSupply(supplyData);
  resetInventoryFilters(); // Reset search filters so newly added item is immediately visible!
  showToast(`已成功儲存耗材【${supplyData.name}】`, "success");
  closeModal("supplyModal");
  renderAllViews();
}

function confirmDeleteSupply(supplyId) {
  if (!rbac.checkActionAllowed("canDeleteSupply", "刪除耗材")) return;

  if (confirm("確定要刪除該筆救護衛材資料嗎？刪除後無法恢復。")) {
    store.deleteSupply(supplyId);
    showToast("已刪除該筆衛材資料", "warning");
    renderAllViews();
  }
}

// User Modal
function openUserEditModal(userId = null) {
  if (!rbac.checkActionAllowed("canManageUsers", "管理人員權限")) return;

  const form = document.getElementById("userForm");
  form.reset();

  if (userId) {
    const users = store.getUsers();
    const u = users.find(x => x.id === userId);
    if (u) {
      document.getElementById("userModalTitle").textContent = "編輯管理人員與權限";
      document.getElementById("userId").value = u.id;
      document.getElementById("userName").value = u.name;
      document.getElementById("userEmail").value = u.email;
      document.getElementById("userDept").value = u.dept || "";
      document.getElementById("userRole").value = u.role;
    }
  } else {
    document.getElementById("userModalTitle").textContent = "新增管理人員";
    document.getElementById("userId").value = "";
  }

  updateRoleDescriptionHint();
  openModal("userEditModal");
}

function saveUser(event) {
  event.preventDefault();
  if (!rbac.checkActionAllowed("canManageUsers", "儲存人員")) return;

  const userData = {
    id: document.getElementById("userId").value,
    name: document.getElementById("userName").value.trim(),
    email: document.getElementById("userEmail").value.trim(),
    dept: document.getElementById("userDept").value.trim(),
    role: document.getElementById("userRole").value
  };

  store.saveUser(userData);
  showToast(`已成功更新人員【${userData.name}】權限為 ${userData.role}`, "success");
  closeModal("userEditModal");
  renderAllViews();
}

function deleteUser(userId) {
  if (!rbac.checkActionAllowed("canManageUsers", "刪除人員")) return;

  const currentUser = store.getCurrentUser();
  if (currentUser.id === userId) {
    showToast("無法刪除當前登入的身分！", "warning");
    return;
  }

  if (confirm("確定要移除該位管理人員嗎？")) {
    store.deleteUser(userId);
    showToast("已移除該位管理人員", "info");
    renderAllViews();
  }
}

// User Quick Switcher Modal (RBAC Tester)
function openUserSwitchModal() {
  const users = store.getUsers();
  const currentUser = store.getCurrentUser();
  const container = document.getElementById("userSwitchModalList");

  container.innerHTML = users.map(u => `
    <div class="user-profile-card mb-2 ${u.id === currentUser.id ? 'border-primary' : ''}" style="cursor: pointer;" onclick="switchActiveUser('${u.id}')">
      <div class="avatar">${u.name.charAt(0)}</div>
      <div class="user-info">
        <div class="user-name">${u.name} ${u.id === currentUser.id ? '<span class="badge badge-success">當前登入</span>' : ''}</div>
        <div class="user-role-badge">${u.role === 'admin' ? '最高管理員' : (u.role === 'editor' ? '庫存管理員' : '救護人員')} (${u.email})</div>
      </div>
      <i data-lucide="chevron-right"></i>
    </div>
  `).join('');

  initLucideIcons();
  openModal("userSwitchModal");
}

function switchActiveUser(userId) {
  store.setCurrentUser(userId);
  const user = store.getCurrentUser();
  showToast(`已切換為【${user.name}】身分 (權限角色: ${user.role})`, "info");
  closeModal("userSwitchModal");
  renderAllViews();
}

// Excel Import Modal
function openExcelImportModal() {
  if (!rbac.checkActionAllowed("canImportExcel", "Excel 匯入")) return;
  document.getElementById("excelFileInput").value = "";
  document.getElementById("excelPreviewSection").style.display = "none";
  document.getElementById("btnConfirmImport").disabled = true;
  openModal("excelImportModal");
}

function setupEventListeners() {
  // Drag and drop for excel
  const dropZone = document.getElementById("dropZone");
  if (dropZone) {
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "var(--accent)";
    });
    dropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "var(--primary)";
    });
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "var(--primary)";
      if (e.dataTransfer.files.length > 0) {
        parseExcelFile(e.dataTransfer.files[0]);
      }
    });
  }
}
