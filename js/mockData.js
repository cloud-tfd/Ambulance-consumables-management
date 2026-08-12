/* ==========================================================================
   EMS Ambulance Consumables Management - Mock Data Initializer
   ========================================================================== */

const INITIAL_MOCK_USERS = [
  {
    id: "usr-admin-01",
    name: "張小明隊員",
    email: "admin.chang@ems.gov.tw",
    dept: "專責救護隊 - 一分隊",
    role: "admin"
  },
  {
    id: "usr-editor-02",
    name: "陳靜宜管理員",
    email: "supply.chen@ems.gov.tw",
    dept: "救護衛材庫房",
    role: "editor"
  },
  {
    id: "usr-viewer-03",
    name: "林救護員",
    email: "ems.lin@ems.gov.tw",
    dept: "2號救護車出勤班",
    role: "viewer"
  }
];

const INITIAL_MOCK_LOCATIONS = [
  { key: "1號救護車-主包", title: "1號救護車 - 主包", icon: "ambulance", description: "第一出勤救護車主要急救包" },
  { key: "1號救護車-備包", title: "1號救護車 - 備包", icon: "briefcase-medical", description: "第一出勤救護車備用耗材包" },
  { key: "2號救護車-主包", title: "2號救護車 - 主包", icon: "ambulance", description: "第二出勤救護車急救包" },
  { key: "1樓小倉", title: "1樓小倉", icon: "box", description: "1樓機動衛材小庫房" },
  { key: "2樓大倉", title: "2樓大倉", icon: "warehouse", description: "主要衛材大型貯存倉庫 (預設預備庫)" }
];

// Calculate relative dates for testing expiry logic
function getRelativeDate(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

const INITIAL_MOCK_SUPPLIES = [
  {
    id: "sup-101",
    name: "靜脈留置針 20G (IV Catheter)",
    category: "靜脈與給藥",
    batch: "LOT-20240810-A",
    expiry: getRelativeDate(-15), // Expired 15 days ago
    quantity: 12,
    minStock: 20,
    unit: "支",
    location: "1號救護車-主包",
    notes: "藍色 20G，急救給藥必備，已過期請儘速換下"
  },
  {
    id: "sup-102",
    name: "氣管內管 Endotracheal Tube 7.5mm",
    category: "呼吸道急救",
    batch: "LOT-20250105-C",
    expiry: getRelativeDate(5), // Expiring in 5 days
    quantity: 4,
    minStock: 5,
    unit: "支",
    location: "1號救護車-主包",
    notes: "帶氣囊，OHCA進階呼吸道使用"
  },
  {
    id: "sup-103",
    name: "止血帶 (CAT Gen7 Tourniquet)",
    category: "創傷止血包紮",
    batch: "LOT-20260211-T",
    expiry: getRelativeDate(25), // Expiring in 25 days (within 30 days)
    quantity: 6,
    minStock: 8,
    unit: "條",
    location: "1號救護車-備包",
    notes: "軍規戰術止血帶"
  },
  {
    id: "sup-104",
    name: "甦醒球組合 (BVM Adult)",
    category: "呼吸道急救",
    batch: "LOT-20260330-B",
    expiry: getRelativeDate(60), // Expiring in 60 days
    quantity: 3,
    minStock: 2,
    unit: "組",
    location: "2號救護車-主包",
    notes: "附氧氣儲氣袋與面罩"
  },
  {
    id: "sup-105",
    name: "生理食鹽水 (Normal Saline 500ml)",
    category: "靜脈與給藥",
    batch: "LOT-20270615-NS",
    expiry: getRelativeDate(365), // Safe
    quantity: 18,
    minStock: 10,
    unit: "瓶",
    location: "1樓小倉",
    notes: "靜脈輸液用，存放於1樓小倉"
  },
  {
    id: "sup-106",
    name: "AED 體外去顫貼片 (Adult Pads)",
    category: "診斷與檢測",
    batch: "LOT-20260401-AED",
    expiry: getRelativeDate(18), // Expiring in 18 days
    quantity: 2,
    minStock: 4,
    unit: "付",
    location: "1號救護車-主包",
    notes: "電擊器貼片，凝膠效期極敏感"
  },
  {
    id: "sup-107",
    name: "無菌滅菌紗布 4x4 (Gauze Pads)",
    category: "創傷止血包紮",
    batch: "LOT-20271201-G",
    expiry: getRelativeDate(500),
    quantity: 150,
    minStock: 50,
    unit: "包",
    location: "2樓大倉",
    notes: "常規包紮耗材"
  },
  {
    id: "sup-108",
    name: "N95 防護口罩",
    category: "車載防護消毒",
    batch: "LOT-20260801-N95",
    expiry: getRelativeDate(80),
    quantity: 45,
    minStock: 20,
    unit: "個",
    location: "1樓小倉",
    notes: "傳染病防護必備，存放於1樓小倉"
  }
];

const INITIAL_REMINDER_SETTINGS = {
  enabled: true,
  intervals: [1, 7, 14, 30], // Days before expiry
  frequency: "daily",        // 'daily', 'weekly_mon', 'monthly_1st'
  time: "08:00",             // Reminder execution time
  recipients: ["admin.chang@ems.gov.tw", "supply.chen@ems.gov.tw"],
  emailjs: {
    serviceId: "",
    templateId: "",
    publicKey: ""
  }
};
