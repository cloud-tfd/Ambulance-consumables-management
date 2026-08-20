#!/usr/bin/env node
/**
 * EMS 救護耗材自動到期提醒腳本
 * 每小時由 GitHub Actions 自動執行，比對網頁設定的時間與頻率
 */

const FIREBASE_URL     = process.env.FIREBASE_URL;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const BOT_EMAIL        = process.env.BOT_EMAIL;
const BOT_PASSWORD     = process.env.BOT_PASSWORD;
const SERVICE_ID       = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID      = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY       = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY      = process.env.EMAILJS_PRIVATE_KEY;
const RECIPIENT_EMAILS = (process.env.RECIPIENT_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean);
const IS_MANUAL_RUN    = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";

const MAX_DAYS = 30;

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function getFirebaseAuthToken() {
  if (!FIREBASE_API_KEY || !BOT_EMAIL || !BOT_PASSWORD) {
    return null;
  }

  try {
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
    const res = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD, returnSecureToken: true })
    });

    if (!res.ok) {
      console.warn("⚠️ Firebase Auth 登入未成功，將以公開模式嘗試讀取");
      return null;
    }

    const data = await res.json();
    return data.idToken;
  } catch (err) {
    console.warn("⚠️ Firebase Auth 異常:", err.message);
    return null;
  }
}

function daysUntilExpiry(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp - today) / 86400000);
}

async function main() {
  console.log("==================================================");
  console.log("🚑 EMS 救護耗材自動提醒掃描引擎");
  console.log("執行時間：", new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }));
  if (IS_MANUAL_RUN) console.log("👉 模式：手動觸發測試 (跳過時間比對)");
  console.log("==================================================");

  if (!FIREBASE_URL) { console.error("❌ 缺少 FIREBASE_URL"); process.exit(1); }
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) { console.error("❌ 缺少 EmailJS 設定"); process.exit(1); }
  if (RECIPIENT_EMAILS.length === 0) { console.error("❌ 缺少收件者 Email (RECIPIENT_EMAILS)"); process.exit(1); }

  // 1. 取得 Firebase 安全憑證
  const idToken = await getFirebaseAuthToken();
  const base = FIREBASE_URL.replace(/\/$/, "");
  const targetUrl = idToken ? `${base}/ems_inventory_data.json?auth=${idToken}` : `${base}/ems_inventory_data.json`;

  console.log("\n📡 正在從 Firebase 讀取最新衛材與提醒設定...");
  let data;
  try {
    data = await fetchJSON(targetUrl);
  } catch (err) {
    console.error("❌ Firebase 讀取失敗:", err.message);
    process.exit(1);
  }

  if (!data || !Array.isArray(data.supplies)) {
    console.log("⚠️ Firebase 目前無耗材資料，結束流程");
    process.exit(0);
  }

  console.log(`✅ 成功讀取到 ${data.supplies.length} 筆耗材資料`);

  // 2. 讀取網頁上設定的規則
  const settings     = data.reminders || {};
  const enabled      = settings.enabled !== false;
  const frequency    = settings.frequency || "weekly_monday";
  const targetTime   = settings.time || "08:00";
  const lastSentDate = settings.lastSentDate || "";

  // 取得台灣目前的日期與時間 (UTC+8)
  const nowTW        = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const todayStr     = nowTW.toISOString().split("T")[0]; // "YYYY-MM-DD"
  const currentHHMM  = nowTW.getHours().toString().padStart(2, "0") + ":" + nowTW.getMinutes().toString().padStart(2, "0");
  const dayOfWeek    = nowTW.getDay();
  const dateOfMonth  = nowTW.getDate();

  const freqLabel = {
    daily: "每日發送",
    weekly_monday: "每週一彙整",
    weekly_friday: "每週五彙整",
    biweekly: "每兩週一次",
    monthly: "每月 1 日彙整"
  }[frequency] || frequency;

  console.log(`\n⚙️ 雲端提醒設定：`);
  console.log(`   - 提醒功能：${enabled ? "✅ 已啟用" : "❌ 已停用"}`);
  console.log(`   - 發信頻率：${freqLabel}`);
  console.log(`   - 預定發信時間：${targetTime}`);
  console.log(`   - 當前台灣時間：${currentHHMM}`);
  console.log(`   - 上次寄信日期：${lastSentDate || "尚無紀錄"}`);

  // 若不是手動測試，則進行排程條件比對
  if (!IS_MANUAL_RUN) {
    if (!enabled) {
      console.log("\n🛑 提醒功能已在網頁設定中停用，跳過發信");
      process.exit(0);
    }

    let shouldSendToday = false;
    if      (frequency === "daily")          shouldSendToday = true;
    else if (frequency === "weekly_monday")  shouldSendToday = (dayOfWeek === 1);
    else if (frequency === "weekly_friday")  shouldSendToday = (dayOfWeek === 5);
    else if (frequency === "biweekly") {
      const weekNum = Math.ceil(((nowTW - new Date(nowTW.getFullYear(), 0, 1)) / 86400000 + 1) / 7);
      shouldSendToday = (dayOfWeek === 1 && weekNum % 2 === 0);
    }
    else if (frequency === "monthly")        shouldSendToday = (dateOfMonth === 1);

    if (!shouldSendToday) {
      console.log(`\n📅 今天不是排定發信日 (${freqLabel})，跳過發信`);
      process.exit(0);
    }

    // 檢查是否已達到設定的時間
    if (currentHHMM < targetTime) {
      console.log(`\n⏳ 尚未到達預定發信時間 (設定: ${targetTime}, 當前: ${currentHHMM})，等待下一輪輪詢`);
      process.exit(0);
    }

    // 檢查今天是否已經發送過
    if (lastSentDate === todayStr) {
      console.log(`\n✅ 今天 (${todayStr}) 已經成功發送過提醒信，無需重複發送`);
      process.exit(0);
    }
  }

  console.log("\n🚀 符合發信時機，開始分析庫存即期狀態...");

  // 3. 篩選即期 / 過期耗材
  const alertItems = [];
  for (const s of data.supplies) {
    if (!s.expiry) continue;
    const days = daysUntilExpiry(s.expiry);
    if (days < 0 || days <= MAX_DAYS) {
      alertItems.push({ supply: s, daysLeft: days });
    }
  }
  alertItems.sort((a, b) => a.daysLeft - b.daysLeft);

  const expiredCount  = alertItems.filter(i => i.daysLeft < 0).length;
  const expiringCount = alertItems.filter(i => i.daysLeft >= 0).length;
  console.log(`📊 庫存統計：${expiredCount} 項已過期 | ${expiringCount} 項即將到期 (${MAX_DAYS} 天內)`);

  if (alertItems.length === 0) {
    console.log("✅ 目前所有救護耗材均在安全效期內，無需發送信件");
    process.exit(0);
  }

  // 4. 組合信件內容
  const subject = `【救護衛材警示】${expiredCount} 項過期 / ${expiringCount} 項即期 — 自動提醒通知`;

  let body = `親愛的救護衛材管理員，您好：\n\n`;
  body += `系統自動掃描發現，共有 ${alertItems.length} 項救護耗材即將到期或已過期，請儘速安排盤點替換！\n\n`;
  body += `掃描時間：${nowTW.toLocaleString("zh-TW")}\n`;
  body += `提醒排程設定：${freqLabel} (${targetTime})\n`;
  body += `========================================================\n`;
  body += `  🚨 即期/過期耗材清冊 (${MAX_DAYS} 天內到期)\n`;
  body += `========================================================\n\n`;

  alertItems.forEach((item, idx) => {
    const s = item.supply;
    const tag = item.daysLeft < 0
      ? `[已過期 ${Math.abs(item.daysLeft)} 天] ❌`
      : `[${item.daysLeft} 天後到期] ⚠️`;
    body += `${idx + 1}. ${tag} ${s.name}\n`;
    body += `   - 放置車輛/分區: ${s.location || "未知"}\n`;
    body += `   - 批號: ${s.batch || "無"} | 有效日期: ${s.expiry}\n`;
    body += `   - 庫存數量: ${s.quantity} ${s.unit || "個"} (安全底限: ${s.minStock || 0})\n`;
    if (s.notes) body += `   - 備註: ${s.notes}\n`;
    body += `--------------------------------------------------------\n`;
  });
  body += `\n請造訪「救護耗材智慧管理系統」執行衛材補給作業。\n`;

  // 5. 發送 Email
  console.log(`\n📧 開始發送郵件給 ${RECIPIENT_EMAILS.length} 位管理人員...`);
  let successCount = 0;

  for (const email of RECIPIENT_EMAILS) {
    try {
      const payload = {
        service_id:      SERVICE_ID,
        template_id:     TEMPLATE_ID,
        user_id:         PUBLIC_KEY,
        accessToken:     PRIVATE_KEY,
        template_params: { to_email: email, subject, message: body }
      };

      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        console.log(`  ✅ 已成功寄送至 ${email}`);
        successCount++;
      } else {
        const errText = await res.text();
        console.error(`  ❌ 寄送至 ${email} 失敗: ${errText}`);
      }
    } catch (err) {
      console.error(`  ❌ 寄送至 ${email} 網路異常: ${err.message}`);
    }
  }

  console.log(`\n=== 寄信結果：${successCount}/${RECIPIENT_EMAILS.length} 封郵件已成功寄出 ===`);

  // 6. 記錄今天已發送至 Firebase
  if (successCount > 0) {
    if (idToken) {
      try {
        console.log(`📝 正在記錄發送狀態至 Firebase (lastSentDate: ${todayStr})...`);
        await fetch(`${base}/ems_inventory_data/reminders/lastSentDate.json?auth=${idToken}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(todayStr)
        });
        console.log("✅ 狀態記錄完成！");
      } catch (e) {
        console.warn("⚠️ 記錄上次發送時間至 Firebase 失敗:", e.message);
      }
    }
  } else {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("腳本發生未預期例外錯誤:", err);
  process.exit(1);
});
