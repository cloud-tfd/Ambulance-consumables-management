/* ==========================================================================
   EMS Consumables Management System - Excel Import/Export & JSON Backup Engine
   ========================================================================== */

/**
 * 1-Click Export Complete System Database (.json Backup File)
 */
function exportFullSystemJSON() {
  const fullBackup = {
    app: "EMS Consumables Management System",
    version: "2.4",
    exportTime: new Date().toLocaleString("zh-TW"),
    supplies: store.getSupplies(),
    locations: store.getLocations(),
    users: store.getUsers(),
    reminders: store.getReminderSettings(),
    auditLogs: store.getAuditLogs()
  };

  const jsonStr = JSON.stringify(fullBackup, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().split('T')[0];
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `救護衛材系統_完整數據備份_${dateStr}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("已成功匯出系統完整備份檔 (.json)！", "success");
}

/**
 * 1-Click Import Complete System Database (.json Backup File)
 */
function importFullSystemJSON() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);

        if (!data.supplies || !Array.isArray(data.supplies)) {
          showToast("無效的備份檔案格式！", "danger");
          return;
        }

        if (confirm(`確定要匯入「${file.name}」備份檔嗎？這將會更新所有耗材、庫位與人員資料。`)) {
          localStorage.setItem(STORAGE_KEYS.SUPPLIES, JSON.stringify(data.supplies));
          if (data.locations) localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(data.locations));
          if (data.users) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
          if (data.reminders) localStorage.setItem(STORAGE_KEYS.REMINDER_SETTINGS, JSON.stringify(data.reminders));
          if (data.auditLogs) localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(data.auditLogs));

          store.init();
          renderAllViews();
          showToast("全系統資料已成功同步復原！", "success");
        }
      } catch (err) {
        console.error("Parse JSON Backup error:", err);
        showToast("解析備份檔案失敗，請確認檔案內容", "danger");
      }
    };
    reader.readAsText(file);
  };

  input.click();
}

/**
 * Download Standard Excel Import Template (.xlsx)
 */
function downloadTemplateExcel() {
  const templateData = [
    {
      "耗材名稱*": "靜脈留置針 22G (IV Catheter)",
      "有效期限(YYYY-MM-DD)*": "2026-12-31",
      "現有數量*": 20,
      "放置位置": "1號救護車-主包",
      "耗材類別": "靜脈與給藥",
      "批號": "LOT-202612-A",
      "安全警戒數量": 10,
      "單位": "支",
      "備註說明": "藍色 22G 急救用"
    },
    {
      "耗材名稱*": "無菌滅菌紗布 4x4",
      "有效期限(YYYY-MM-DD)*": "2027-06-30",
      "現有數量*": 100,
      "放置位置": "2樓大倉",
      "耗材類別": "創傷止血包紮",
      "批號": "LOT-202706-G",
      "安全警戒數量": 30,
      "單位": "包",
      "備註說明": "若位置留空將預設放置於「2樓大倉」"
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "耗材匯入範本");

  // Auto column widths
  worksheet["!cols"] = [
    { wch: 30 }, { wch: 22 }, { wch: 12 }, { wch: 18 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 25 }
  ];

  XLSX.writeFile(workbook, "救護耗材匯入範本_標準格式.xlsx");
  showToast("已下載 Excel 匯入範本 (.xlsx)", "info");
}

/**
 * Download Standard CSV Import Template (.csv with UTF-8 BOM)
 */
function downloadTemplateCSV() {
  const csvContent = 
    "\ufeff耗材名稱*,有效期限(YYYY-MM-DD)*,現有數量*,放置位置,耗材類別,批號,安全警戒數量,單位,備註說明\n" +
    "靜脈留置針 22G,2026-12-31,20,1號救護車-主包,靜脈與給藥,LOT-202612-A,10,支,急救給藥用\n" +
    "甦醒球組合 (BVM Adult),2026-08-30,3,2號救護車-主包,呼吸道急救,LOT-202608-B,2,組,附儲氣袋\n" +
    "生理食鹽水 500ml,2027-05-15,15,,靜脈與給藥,LOT-202705-NS,5,瓶,位置留空預設為2樓大倉\n";

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "救護耗材匯入範本_標準格式.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("已下載 CSV 匯入範本 (.csv)", "info");
}

/**
 * Export Current Inventory List to Excel
 */
function exportInventoryExcel() {
  const supplies = store.getSupplies();
  if (supplies.length === 0) {
    showToast("目前尚無衛材資料可供導出", "warning");
    return;
  }

  const exportData = supplies.map((s, idx) => {
    const info = getSupplyStatusInfo(s);
    return {
      "項次": idx + 1,
      "耗材品項名稱": s.name,
      "分類": s.category,
      "批號": s.batch || "無",
      "有效期限": s.expiry,
      "剩餘天數": info.daysLeft,
      "效期狀態": info.label,
      "放置位置": s.location,
      "現有數量": s.quantity,
      "安全存量": s.minStock,
      "單位": s.unit,
      "備註": s.notes || ""
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "庫存清冊");

  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `救護耗材庫存清冊報表_${dateStr}.xlsx`);

  store.addAuditLog(store.getCurrentUser().name, "導出 Excel", `成功導出 ${supplies.length} 筆衛材清冊`, "導出");
  showToast("已成功匯出 Excel 庫存清冊報表！", "success");
}

/**
 * Parse uploaded Excel / CSV File
 */
function parseExcelFile(file) {
  const reader = new FileReader();
  
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      validateAndPreviewImportData(rawRows);
    } catch (err) {
      console.error("Excel Read Error:", err);
      showToast("無法解析該檔案，請確認檔案格式為 Excel (.xlsx) 或 CSV (.csv)", "danger");
    }
  };

  reader.readAsArrayBuffer(file);
}

function handleExcelFileSelect(event) {
  const file = event.target.files[0];
  if (file) parseExcelFile(file);
}

/**
 * Validate preview import rows enforcing 3 mandatory fields & fallback to "2樓大倉"
 */
let parsedImportItemsCache = [];

function validateAndPreviewImportData(rawRows) {
  if (!rawRows || rawRows.length === 0) {
    showToast("匯入的檔案中未發現有效的資料列", "warning");
    return;
  }

  const locations = store.getLocations();
  const validLocationKeys = locations.map(l => l.key);
  const defaultLocation = validLocationKeys.includes("2樓大倉") ? "2樓大倉" : (validLocationKeys[0] || "2樓大倉");

  parsedImportItemsCache = [];
  let validCount = 0;
  let invalidCount = 0;

  const previewTableBody = document.getElementById("excelPreviewTableBody");
  previewTableBody.innerHTML = "";

  rawRows.forEach((row, index) => {
    // Flexible header mapping
    const name = (row["耗材名稱*"] || row["耗材名稱"] || row["品項名稱"] || row["名稱"] || "").toString().trim();
    
    let expiryStr = row["有效期限(YYYY-MM-DD)*"] || row["有效期限"] || row["到期日"] || row["到期日期"] || "";
    if (expiryStr instanceof Date) {
      expiryStr = expiryStr.toISOString().split('T')[0];
    } else {
      expiryStr = expiryStr.toString().trim();
    }

    const qtyRaw = row["現有數量*"] || row["現有數量"] || row["數量"] || row["庫存數量"];
    const quantity = parseInt(qtyRaw);

    // Optional fields with smart defaults
    let location = (row["放置位置"] || row["位置"] || row["存放區"] || "").toString().trim();
    if (!location) {
      location = defaultLocation; // Fallback to "2樓大倉"
    }

    const category = (row["耗材類別"] || row["分類"] || "").toString().trim() || "呼吸道急救";
    const batch = (row["批號"] || row["Lot No"] || "").toString().trim() || "無";
    const minStock = parseInt(row["安全警戒數量"] || row["安全量"]) || 5;
    const unit = (row["單位"] || "").toString().trim() || "個";
    const notes = (row["備註說明"] || row["備註"] || "").toString().trim();

    // 3 Mandatory Fields Validation
    const isNameValid = !!name;
    const isExpiryValid = !!expiryStr && /^\d{4}-\d{2}-\d{2}$/.test(expiryStr);
    const isQtyValid = !isNaN(quantity) && quantity >= 0;

    const isValid = isNameValid && isExpiryValid && isQtyValid;

    if (isValid) {
      validCount++;
      parsedImportItemsCache.push({
        name,
        expiry: expiryStr,
        quantity,
        category,
        batch,
        location,
        minStock,
        unit,
        notes
      });
    } else {
      invalidCount++;
    }

    let errorReason = [];
    if (!isNameValid) errorReason.push("缺耗材名稱");
    if (!isExpiryValid) errorReason.push("到期日格式應為 YYYY-MM-DD");
    if (!isQtyValid) errorReason.push("數量需為數字");

    const tr = document.createElement("tr");
    tr.className = isValid ? "" : "table-danger";
    tr.innerHTML = `
      <td><strong>${name || '<span class="text-danger">未填</span>'}</strong></td>
      <td>${expiryStr || '<span class="text-danger">未填</span>'}</td>
      <td>${!isNaN(quantity) ? quantity : '<span class="text-danger">未填</span>'}</td>
      <td>${category}</td>
      <td><code>${batch}</code></td>
      <td><span class="badge badge-info">${location}</span></td>
      <td>
        ${isValid 
          ? '<span class="badge badge-success">對應成功</span>' 
          : `<span class="badge badge-danger" title="${errorReason.join(', ')}">格式錯誤 (${errorReason.join(', ')})</span>`}
      </td>
    `;
    previewTableBody.appendChild(tr);
  });

  document.getElementById("excelRecordCount").textContent = rawRows.length;
  document.getElementById("excelPreviewSection").style.display = "block";

  const btnConfirm = document.getElementById("btnConfirmImport");
  const statusDiv = document.getElementById("excelValidationStatus");

  if (validCount > 0) {
    btnConfirm.disabled = false;
    statusDiv.innerHTML = `
      <span class="text-success fw-bold">✓ 通過檢核: ${validCount} 筆</span> 
      ${invalidCount > 0 ? `<span class="text-danger ms-2">✗ 無效資料: ${invalidCount} 筆 (將自動跳過)</span>` : ''}
    `;
  } else {
    btnConfirm.disabled = true;
    statusDiv.innerHTML = `<span class="text-danger fw-bold">✗ 無可匯入之有效資料，請檢查 3 項必填欄位</span>`;
  }

  initLucideIcons();
}

function confirmImportExcel() {
  if (parsedImportItemsCache.length === 0) return;

  store.batchImportSupplies(parsedImportItemsCache);
  showToast(`成功匯入 ${parsedImportItemsCache.length} 筆救護耗材至庫存清冊！`, "success");
  
  closeModal("excelImportModal");
  renderAllViews();
}
