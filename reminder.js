/* ==========================================================================
   EMS Consumables Management System - Expiry Alert & Email Reminder Engine
   ========================================================================== */

/**
 * Calculate detailed status and remaining days for a supply item
 */
function getSupplyStatusInfo(supply) {
  if (!supply.expiry) {
    return { status: "unknown", daysLeft: 9999, label: "未填效期", class: "badge-info" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expDate = new Date(supply.expiry);
  expDate.setHours(0, 0, 0, 0);

  const diffTime = expDate - today;
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Check Expiry Status
  if (daysLeft < 0) {
    return {
      status: "expired",
      daysLeft,
      label: `已過期 ${Math.abs(daysLeft)} 天`,
      class: "badge-danger",
      isExpired: true
    };
  }

  // Get active reminder intervals thresholds from settings
  const settings = store.getReminderSettings();
  const maxThreshold = settings.intervals && settings.intervals.length > 0 
    ? Math.max(...settings.intervals) 
    : 30;

  if (daysLeft <= maxThreshold) {
    return {
      status: "expiring",
      daysLeft,
      label: `${daysLeft} 天內到期`,
      class: daysLeft <= 7 ? "badge-danger" : "badge-warning",
      isExpiring: true
    };
  }

  // Check Low Stock
  if (supply.quantity <= supply.minStock) {
    return {
      status: "low_stock",
      daysLeft,
      label: `庫存偏低 (${supply.quantity}/${supply.minStock})`,
      class: "badge-purple",
      isLowStock: true
    };
  }

  return {
    status: "safe",
    daysLeft,
    label: `效期正常 (${daysLeft} 天)`,
    class: "badge-success"
  };
}

/**
 * Filter supplies that match the automated reminder criteria
 */
function getExpiringAndExpiredSuppliesList() {
  const supplies = store.getSupplies();
  const settings = store.getReminderSettings();
  const intervals = settings.intervals || [1, 7, 14, 30];
  const maxDays = Math.max(...intervals, 30);

  const alertItems = [];

  supplies.forEach(s => {
    const info = getSupplyStatusInfo(s);
    if (info.isExpired || info.daysLeft <= maxDays) {
      alertItems.push({
        supply: s,
        info
      });
    }
  });

  // Sort: Expired items first, then items closest to expiry date
  alertItems.sort((a, b) => a.info.daysLeft - b.info.daysLeft);
  return alertItems;
}

/**
 * Save Reminder Settings from UI Form
 */
function saveReminderSettings(event) {
  event.preventDefault();

  if (!rbac.checkActionAllowed("canConfigureReminders", "設定提醒規則")) return;

  const enabled = document.getElementById("reminderEnabled").checked;
  const frequency = document.getElementById("reminderFrequency").value;
  const time = document.getElementById("reminderTime").value;

  // Selected Intervals
  const intervalCheckboxes = document.querySelectorAll('input[name="reminderInterval"]:checked');
  const intervals = Array.from(intervalCheckboxes).map(cb => parseInt(cb.value));

  if (enabled && intervals.length === 0) {
    showToast("請至少勾選一個到期提醒天數區間！", "warning");
    return;
  }

  // Selected Recipients
  const recipientCheckboxes = document.querySelectorAll('input[name="reminderRecipient"]:checked');
  const recipients = Array.from(recipientCheckboxes).map(cb => cb.value);

  if (enabled && recipients.length === 0) {
    showToast("請至少勾選一位接收提醒信的管理人員！", "warning");
    return;
  }

  // EmailJS API Keys
  const emailjs = {
    serviceId: document.getElementById("emailjsServiceId").value.trim(),
    templateId: document.getElementById("emailjsTemplateId").value.trim(),
    publicKey: document.getElementById("emailjsPublicKey").value.trim()
  };

  const newSettings = {
    enabled,
    intervals,
    frequency,
    time,
    recipients,
    emailjs
  };

  store.saveReminderSettings(newSettings);
  showToast("已成功儲存到期提醒與寄信排程規則！", "success");
  renderReminderSettingsView();
}

/**
 * Trigger Immediate Test Email Alert Dispatch (Supports Real EmailJS & Web Simulation)
 */
async function triggerImmediateEmailDispatch() {
  const alertList = getExpiringAndExpiredSuppliesList();
  const settings = store.getReminderSettings();

  if (!settings.recipients || settings.recipients.length === 0) {
    showToast("請先勾選收件管理人員的 Email 帳號", "warning");
    return;
  }

  const expiredCount = alertList.filter(item => item.info.isExpired).length;
  const expiringCount = alertList.filter(item => !item.info.isExpired).length;

  const subject = `【救護衛材警示】緊急衛材到期提醒 (${expiredCount} 項過期 / ${expiringCount} 項即期)`;
  
  // Format Email Body Text
  let bodyText = `親愛的救護衛材管理員，您好：\n\n`;
  bodyText += `系統檢測到救護車輛與分隊衛材庫存中，共有 ${alertList.length} 項耗材即將到期或已過期，請儘速排程盤點替換！\n\n`;
  bodyText += `========================================================\n`;
  bodyText += ` 🚨 即期/過期衛材詳細清冊 (到期提醒區間: ${settings.intervals.join(', ')} 天前)\n`;
  bodyText += `========================================================\n\n`;

  alertList.forEach((item, index) => {
    const s = item.supply;
    const info = item.info;
    const tag = info.isExpired ? "[已過期] ❌" : `[${info.daysLeft}天內到期] ⚠️`;
    
    bodyText += `${index + 1}. ${tag} ${s.name}\n`;
    bodyText += `   - 放置車輛/庫位: ${s.location}\n`;
    bodyText += `   - 批號: ${s.batch || '無'} | 有效日期: ${s.expiry}\n`;
    bodyText += `   - 庫存數量: ${s.quantity} ${s.unit} (安全底限: ${s.minStock} ${s.unit})\n`;
    if (s.notes) bodyText += `   - 備註: ${s.notes}\n`;
    bodyText += `--------------------------------------------------------\n`;
  });

  bodyText += `\n請造訪「救護耗材智慧管理系統」執行衛材補給與下架作業。\n`;
  bodyText += `發送時間: ${new Date().toLocaleString("zh-TW")}\n`;

  // Check if Real EmailJS API Key is Configured
  const hasEmailJS = settings.emailjs && settings.emailjs.serviceId && settings.emailjs.templateId && settings.emailjs.publicKey;

  if (hasEmailJS) {
    showToast("正在經由 EmailJS 連線發送真實電子郵件中...", "info");
    
    try {
      // Loop send to each recipient
      for (const email of settings.recipients) {
        const payload = {
          service_id: settings.emailjs.serviceId,
          template_id: settings.emailjs.templateId,
          user_id: settings.emailjs.publicKey,
          template_params: {
            to_email: email,
            subject: subject,
            message: bodyText
          }
        };

        const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          store.addOutboxLog(subject, email, bodyText, "Real Email Sent (真實成功寄出)");
        } else {
          const errText = await res.text();
          console.error("EmailJS Send Error:", errText);
          store.addOutboxLog(subject, email, bodyText, `EmailJS Failed: ${errText}`);
        }
      }

      showToast("真實郵件發送完成！請查閱收件匣與寄信日誌", "success");
    } catch (err) {
      console.error("Fetch EmailJS Error:", err);
      store.addOutboxLog(subject, settings.recipients, bodyText, `Network Error: ${err.message}`);
      showToast("連線至郵件伺服器失敗，請確認 API Key 與網路連線", "danger");
    }
  } else {
    // Simulated Mail Log Dispatch
    store.addOutboxLog(subject, settings.recipients, bodyText, "Simulated (系統模擬發送)");
    showToast(`[模擬發送成功] 已模擬發送至 ${settings.recipients.length} 位管理員 Email。若要真實寄信請填寫下方 EmailJS Key！`, "success");
  }
  
  // Check Browser Notification Permission
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(subject, {
      body: `共有 ${alertList.length} 項急救耗材需要處置。`,
      icon: "https://unpkg.com/lucide-static@0.321.0/icons/ambulance.svg"
    });
  }

  renderOutboxLogsView();
}

/**
 * Render Reminder Settings Tab Components
 */
function renderReminderSettingsView() {
  const settings = store.getReminderSettings();
  const users = store.getUsers();

  // 1. Toggle & Inputs
  const enabledEl = document.getElementById("reminderEnabled");
  if (enabledEl) enabledEl.checked = !!settings.enabled;

  const freqEl = document.getElementById("reminderFrequency");
  if (freqEl) freqEl.value = settings.frequency || "daily";

  const timeEl = document.getElementById("reminderTime");
  if (timeEl) timeEl.value = settings.time || "08:00";

  // 2. Checkboxes for Intervals
  const intervals = settings.intervals || [1, 7, 14, 30];
  const intervalCheckboxes = document.querySelectorAll('input[name="reminderInterval"]');
  intervalCheckboxes.forEach(cb => {
    cb.checked = intervals.includes(parseInt(cb.value));
  });

  // 3. Render Recipient Checkboxes (Admin / Editor Users)
  const recipientsContainer = document.getElementById("reminderRecipientsList");
  if (recipientsContainer) {
    const targetUsers = users.filter(u => u.role === "admin" || u.role === "editor");
    const activeRecipients = settings.recipients || [];

    recipientsContainer.innerHTML = targetUsers.map(u => `
      <label class="checkbox-btn mb-2">
        <input type="checkbox" name="reminderRecipient" value="${u.email}" 
          ${activeRecipients.includes(u.email) ? 'checked' : ''}>
        <div>
          <strong>${u.name}</strong> 
          <span class="text-subtitle">(${u.role === 'admin' ? '最高管理員' : '庫存管理員'}) - ${u.email}</span>
        </div>
      </label>
    `).join('');
  }

  // 4. EmailJS Keys
  if (settings.emailjs) {
    document.getElementById("emailjsServiceId").value = settings.emailjs.serviceId || "";
    document.getElementById("emailjsTemplateId").value = settings.emailjs.templateId || "";
    document.getElementById("emailjsPublicKey").value = settings.emailjs.publicKey || "";
  }

  renderOutboxLogsView();
}

/**
 * Render Outbox Email Log History
 */
function renderOutboxLogsView() {
  const logs = store.getOutboxLogs();
  const container = document.getElementById("outboxLogList");
  if (!container) return;

  if (logs.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5 text-subtitle">
        <i data-lucide="mail-open" style="width: 48px; height: 48px; opacity: 0.4;"></i>
        <p class="mt-2">目前尚無已發送的提醒郵件紀錄</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = logs.map(log => `
    <div class="mail-item">
      <div class="mail-header">
        <span class="mail-subject"><i data-lucide="mail"></i> ${log.subject}</span>
        <span class="badge ${log.status.includes('Real') || log.status.includes('Success') ? 'badge-success' : 'badge-warning'}">${log.status}</span>
      </div>
      <div class="text-subtitle mb-2">
        <i data-lucide="user-check"></i> 收件者: <strong>${log.recipients}</strong> | <i data-lucide="clock"></i> ${log.timestamp}
      </div>
      <div class="mail-body">${log.body}</div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function clearOutboxLogs() {
  store.clearOutboxLogs();
  showToast("已清空寄信日誌紀錄", "info");
  renderOutboxLogsView();
}
