#!/usr/bin/env node

const FIREBASE_URL = process.env.FIREBASE_URL;
const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const RECIPIENT_EMAILS = (process.env.RECIPIENT_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean);

const MAX_DAYS = 30;

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

function daysUntilExpiry(expiryDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDateStr);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
}

async function main() {
  console.log("=== 救護耗材自動提醒腳本啟動 ===");
  console.log("執行時間：", new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }));

  if (!FIREBASE_URL) { console.error("❌ 缺少 FIREBASE_URL"); process.exit(1); }
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) { console.error("❌ 缺少 EmailJS 設定"); process.exit(1); }
  if (RECIPIENT_EMAILS.length === 0) { console.error("❌ 缺少收件者 Email"); process.exit(1); }

  const base = FIREBASE_URL.replace(/\/$/, "");
  console.log(`\n📡 從 Firebase 讀取資料...`);

  let data;
  try {
    data = await fetchJSON(`${base}/ems_inventory_data.json`);
  } catch (err) {
    console.error("❌ Firebase 讀取失敗:", err.message);
    process.exit(1);
  }

  if (!data || !Array.isArray(data.supplies)) {
    console.log("⚠️ Firebase 無耗材資料，跳過發信");
    process.exit(0);
  }

  const supplies = data.supplies;
  console.log(`✅ 讀取到 ${supplies.length} 筆耗材資料`);

  const alertItems = [];
  for (const s of supplies) {
    if (!s.expiry) continue;
    const days = daysUntilExpiry(s.expiry);
    if (days < 0 || days <= MAX_DAYS) {
      alertItems.push({ supply: s, daysLeft: days });
    }
  }

  alertItems.sort((a, b) => a.daysLeft - b.daysLeft);

  const expiredCount = alertItems.filter(i => i.daysLeft < 0).length;
  const expiringCount = alertItems.filter(i => i.daysLeft >= 0).length;

  console.log(`\n📊 統計：${expiredCount} 項已過期 | ${expiringCount} 項即將到期`);

  if (alertItems.length === 0) {
    console.log("✅ 無需發送提醒（所有耗材均在安全效期內）");
    process.exit(0);
  }

  const subject = `【救護衛材警示】${expiredCount} 項過期 / ${expiringCount} 項即期 — 每週自動通知`;

  let body = `親愛的救護衛材管理員，您好：\n\n`;
  body += `系統自動掃描發現，共有 ${alertItems.length} 項耗材即將到期或已過期，請儘速安排盤點替換！\n\n`;
  body += `掃描時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}\n`;
  body += `========================================================\n`;
  body += `  🚨 即期/過期耗材清冊 (${MAX_DAYS} 天內到期)\n`;
  body += `========================================================\n\n`;

  alertItems.forEach((item, idx) => {
    const s = item.supply;
    const tag = item.daysLeft < 0
      ? `[已過期 ${Math.abs(item.daysLeft)} 天] ❌`
      : `[${item.daysLeft} 天後到期] ⚠️`;
    body += `${idx + 1}. ${tag} ${s.name}\n`;
    body += `   - 庫位: ${s.location || "未知"}\n`;
    body += `   - 批號: ${s.batch || "無"} | 效期: ${s.expiry}\n`;
    body += `   - 數量: ${s.quantity} ${s.unit || "個"} (安全底限: ${s.minStock || 0})\n`;
    body += `--------------------------------------------------------\n`;
  });

  body += `\n請前往「救護耗材智慧管理系統」進行補給作業。\n`;

  console.log(`\n📧 開始發送郵件給 ${RECIPIENT_EMAILS.length} 位收件者...`);
  let successCount = 0;

  for (const email of RECIPIENT_EMAILS) {
    try {
      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: SERVICE_ID,
          template_id: TEMPLATE_ID,
          user_id: PUBLIC_KEY,
          template_params: { to_email: email, subject, message: body }
        })
      });

      if (res.ok) {
        console.log(`  ✅ 已寄送至 ${email}`);
        successCount++;
      } else {
        const errText = await res.text();
        console.error(`  ❌ 寄送至 ${email} 失敗: ${errText}`);
      }
    } catch (err) {
      console.error(`  ❌ 寄送至 ${email} 網路錯誤: ${err.message}`);
    }
  }

  console.log(`\n=== 完成 ${successCount}/${RECIPIENT_EMAILS.length} 封郵件已成功寄出 ===`);
  if (successCount === 0) process.exit(1);
}

main().catch(err => {
  console.error("腳本發生未預期錯誤:", err);
  process.exit(1);
});
