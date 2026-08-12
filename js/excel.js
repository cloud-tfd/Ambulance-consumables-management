/* ==========================================================================
   EMS Consumables Management System - SheetJS Excel Import / Export Module
   ========================================================================== */

let pendingParsedExcelData = [];

/**
 * Standard Sample Dataset for Exporting Template Files
 */
const SAMPLE_IMPORT_ROWS = [
  {
    "耗材名稱*": "靜脈留置針 22G (IV Catheter)",
    "有效期限(YYYY-MM-DD)*": "2026-11-30",
    "現有數量*": 25,
    "耗材類別": "靜脈與給藥",
    "批號": "LOT-2026-V1",
    "安全警戒數量": 10,
    "單位": "支",
    "放置位置": "1號救護車-主包",
    "備註說明": "常用給藥靜脈針"
  },
  {
    "耗材名稱*": "氣管內管 7.0mm (ET Tube)",
    "有效期限(YYYY-MM-DD)*": "2026-09-15",
    "現有數量*": 6,
    "耗材類別": "呼吸道急救",
    "批號": "LOT-2026-R2",
    "安全警戒數量": 3,
    "單位": "支",
    "放置位置": "1號救護車-主包",
    "備註說明": "帶氣囊急救插管"
  },
  {
    "耗材名稱*": "戰術止血帶 Gen7 (CAT Tourniquet)",
    "有效期限(YYYY-MM-DD)*": "2027-04-20",
    "現有數量*": 10,
    "耗材類別": "創傷止血包紮",
    "批號": "LOT-2027-T3",
    "安全警戒數量": 5,
    "單位": "條",
    "放置位置": "2號救護車-主包",
    "備註說明": "軍規動脈止血帶"
  },
  {
    "耗材名稱*": "甦醒球面罩 (BVM Mask Adult)",
    "有效期限(YYYY-MM-DD)*": "2026-12-01",
    "現有數量*": 8,
    "耗材類別": "",
    "批號": "",
    "安全警戒數量": "",
    "單位": "",
    "放置位置": "",
    "備註說明": "位置留空將預設為「2樓大倉」"
  }
];

/**
 * Generate and download standard Excel template (.xlsx)
 */
function downloadTemplateExcel() {
  const ws = XLSX.utils.json_to_sheet(SAMPLE_IMPORT_ROWS);
  
  // Set custom column widths
  ws['!cols'] = [
    { wch: 30 }, // 耗材名稱
    { wch: 22 }, // 有效期限
    { wch: 12 }, // 現有數量
    { wch: 16 }, // 耗材類別
    { wch: 18 }, // 批號
    { wch: 14 }, // 安全數量
    { wch: 8 },  // 單位
    { wch: 20 }, // 放置位置
    { wch: 25 }  // 備註說明
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "救護耗材匯入範本");

  XLSX.writeFile(wb, "救護耗材標準匯入範本_EMS.xlsx");
  showToast("已成功下載標準 Excel 匯入範本 (.xlsx)", "success");
}

/**
 * Download standard CSV sample file (.csv)
 */
function downloadTemplateCSV() {
  const ws = XLSX.utils.json_to_sheet(SAMPLE_IMPORT_ROWS);
  const csvOutput = XLSX.utils.sheet_to_csv(ws);
  
  // Add UTF-8 BOM for Excel Chinese compatibility
  const blob = new Blob(["\ufeff" + csvOutput], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "救護耗材標準匯入範本_EMS.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("已成功下載 CSV 匯入範本 (.csv)", "success");
}

/**
 * Export current inventory to Excel file
 */
function exportInventoryExcel() {
  if (!rbac.checkActionAllowed("canExportExcel", "匯出 Excel 報表")) return;

  const supplies = store.getSupplies();
  if (!supplies || supplies.length === 0) {
    showToast("目前庫存無資料可供導出", "warning");
    return;
  }

  const exportRows = supplies.map(s => {
    const status = getSupplyStatusInfo(s);
    return {
      "耗材品項名稱": s.name,
      "有效到期日": s.expiry,
      "現有庫存數量": s.quantity,
      "類別": s.category || "未分類",
      "批號": s.batch || "無",
      "放置位置": s.location || "2樓大倉",
      "安全預警數量": s.minStock || 5,
      "單位": s.unit || "個",
      "效期狀態": status.label,
      "剩餘天數": status.daysLeft < 0 ? `已過期 ${Math.abs(status.daysLeft)} 天` : `${status.daysLeft} 天`,
      "備註說明": s.notes || ""
    };
  });

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "救護衛材庫存清冊");

  const todayStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `救護耗材庫存清冊_${todayStr}.xlsx`);

  store.addAuditLog(store.getCurrentUser().name, "匯出 Excel 報表", `成功導出 ${exportRows.length} 筆庫存紀錄`, `${exportRows.length} 筆`);
  showToast(`已成功導出 ${exportRows.length} 筆庫存資料 Excel`, "success");
}

/**
 * Handle File Selection from Modal Input or Dropzone
 */
function handleExcelFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  parseExcelFile(file);
}

/**
 * Parse Excel / CSV File via SheetJS
 */
function parseExcelFile(file) {
  const reader = new FileReader();

  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!rawJson || rawJson.length === 0) {
        showToast("該 Excel 檔案為空或無有效資料列", "danger");
        return;
      }

      pendingParsedExcelData = processAndValidateExcelRows(rawJson);
      renderExcelPreviewTable(pendingParsedExcelData);

    } catch (err) {
      console.error("Excel Parse Error:", err);
      showToast("解析 Excel 檔案失敗，請確認檔案格式為 .xlsx 或 .csv", "danger");
    }
  };

  reader.readAsArrayBuffer(file);
}

/**
 * Map header fields & validate data integrity (DEFAULT LOCATION = 2樓大倉)
 */
function processAndValidateExcelRows(rows) {
  return rows.map((row, index) => {
    // Flexible header mapping for the 3 Mandatory Fields
    const name = String(row["耗材名稱*"] || row["耗材名稱"] || row["品項名稱"] || row["Name"] || "").trim();
    let expiry = row["有效期限(YYYY-MM-DD)*"] || row["有效期限"] || row["到期日"] || row["Expiry"] || "";
    const rawQty = row["現有數量*"] || row["現有數量"] || row["數量"] || row["Qty"];
    const quantity = (rawQty !== "" && rawQty !== undefined) ? parseInt(rawQty) : NaN;

    // Optional Fields (LOCATION DEFAULTS TO "2樓大倉" IF BLANK)
    const category = String(row["耗材類別"] || row["類別"] || row["Category"] || "呼吸道急救").trim();
    const batch = String(row["批號"] || row["Batch"] || row["Lot"] || "無").trim();
    const minStock = parseInt(row["安全警戒數量"] || row["安全量"] || 5) || 5;
    const unit = String(row["單位"] || row["Unit"] || "個").trim();
    const location = String(row["放置位置"] || row["Location"] || "2樓大倉").trim();
    const notes = String(row["備註說明"] || row["備註"] || "").trim();

    // Format Expiry Date
    if (expiry instanceof Date) {
      expiry = expiry.toISOString().split('T')[0];
    } else if (typeof expiry === "number") {
      // Excel Serial Date Conversion
      const d = XLSX.SSF.parse_date_code(expiry);
      if (d) {
        expiry = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
      }
    } else {
      expiry = String(expiry).trim();
    }

    // STRICT VALIDATION ON 3 MANDATORY FIELDS ONLY
    const errors = [];
    if (!name) errors.push("缺耗材名稱");
    if (!expiry || isNaN(Date.parse(expiry))) errors.push("到期日無效(須為 YYYY-MM-DD)");
    if (isNaN(quantity) || quantity < 0) errors.push("數量缺漏或格式不符");

    return {
      rowIndex: index + 1,
      name,
      category: category || "呼吸道急救",
      batch: batch || "無",
      expiry,
      quantity,
      minStock,
      unit: unit || "個",
      location: location || "2樓大倉", // DEFAULT LOCATION = 2樓大倉
      notes,
      isValid: errors.length === 0,
      errors: errors.join(", ")
    };
  });
}

/**
 * Render Live Preview Table in Excel Import Modal
 */
function renderExcelPreviewTable(parsedData) {
  const container = document.getElementById("excelPreviewSection");
  const tbody = document.getElementById("excelPreviewTableBody");
  const recordCountEl = document.getElementById("excelRecordCount");
  const statusEl = document.getElementById("excelValidationStatus");
  const confirmBtn = document.getElementById("btnConfirmImport");

  container.style.display = "block";
  recordCountEl.textContent = parsedData.length;

  const validCount = parsedData.filter(d => d.isValid).length;
  const invalidCount = parsedData.length - validCount;

  if (invalidCount === 0) {
    statusEl.innerHTML = `<span class="badge badge-success"><i data-lucide="check-circle"></i> 全部 ${validCount} 筆通過校驗</span>`;
    confirmBtn.disabled = false;
  } else {
    statusEl.innerHTML = `<span class="badge badge-warning"><i data-lucide="alert-triangle"></i> ${invalidCount} 筆格式不符 (${validCount} 筆可匯入)</span>`;
    confirmBtn.disabled = validCount === 0;
  }

  tbody.innerHTML = parsedData.map(row => `
    <tr class="${row.isValid ? '' : 'table-danger'}">
      <td><strong>${row.name || '<span class="text-danger">未填(必填)</span>'}</strong></td>
      <td>${row.expiry || '<span class="text-danger">無效(必填)</span>'}</td>
      <td>${!isNaN(row.quantity) ? row.quantity + ' ' + row.unit : '<span class="text-danger">未填(必填)</span>'}</td>
      <td><span class="badge badge-info">${row.category}</span></td>
      <td><code>${row.batch}</code></td>
      <td>${row.location}</td>
      <td>
        ${row.isValid 
          ? '<span class="badge badge-success">正常</span>' 
          : `<span class="badge badge-danger" title="${row.errors}">${row.errors}</span>`}
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

/**
 * Confirm and merge validated rows into store
 */
function confirmImportExcel() {
  if (!rbac.checkActionAllowed("canImportExcel", "Excel 匯入")) return;

  const validRows = pendingParsedExcelData.filter(d => d.isValid);
  if (validRows.length === 0) {
    showToast("沒有可供匯入的有效數據", "warning");
    return;
  }

  const cleanRows = validRows.map(r => ({
    name: r.name,
    category: r.category || "呼吸道急救",
    batch: r.batch || "無",
    expiry: r.expiry,
    quantity: r.quantity,
    minStock: r.minStock || 5,
    unit: r.unit || "個",
    location: r.location || "2樓大倉", // DEFAULT LOCATION = 2樓大倉
    notes: r.notes || ""
  }));

  store.batchImportSupplies(cleanRows);
  showToast(`已成功將 ${cleanRows.length} 筆救護耗材匯入庫存！`, "success");

  closeModal("excelImportModal");
  pendingParsedExcelData = [];
  renderAllViews();
}
