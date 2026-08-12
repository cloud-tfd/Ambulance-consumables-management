/* ==========================================================================
   EMS Consumables Management System - Role-Based Access Control (RBAC) Engine
   ========================================================================== */

const ROLES = {
  ADMIN: {
    key: "admin",
    label: "最高管理員 (Super Admin)",
    description: "具備系統最高權限。可新增/編輯/刪除耗材、增刪管理人員、調整自動寄信提醒規則與 Excel 匯入匯出。"
  },
  EDITOR: {
    key: "editor",
    label: "庫存管理員 (Supply Editor)",
    description: "具備衛材維護權限。可新增/編輯耗材數量與批號、執行 Excel 匯入匯出。無刪除耗材與管理人員權限。"
  },
  VIEWER: {
    key: "viewer",
    label: "救護隊員 (EMS Viewer)",
    description: "僅供瀏覽。可即時查詢救護車與急救包備品數量、效期狀態與過期警告。無修改或編輯權限。"
  }
};

class RBAC {
  constructor() {
    this.permissions = {
      admin: {
        canAddSupply: true,
        canEditSupply: true,
        canDeleteSupply: true,
        canManageUsers: true,
        canConfigureReminders: true,
        canImportExcel: true,
        canExportExcel: true
      },
      editor: {
        canAddSupply: true,
        canEditSupply: true,
        canDeleteSupply: false,
        canManageUsers: false,
        canConfigureReminders: false,
        canImportExcel: true,
        canExportExcel: true
      },
      viewer: {
        canAddSupply: false,
        canEditSupply: false,
        canDeleteSupply: false,
        canManageUsers: false,
        canConfigureReminders: false,
        canImportExcel: false,
        canExportExcel: true
      }
    };
  }

  getCurrentUser() {
    return store.getCurrentUser();
  }

  hasPermission(permissionName) {
    const user = this.getCurrentUser();
    const role = user ? user.role : "viewer";
    const rolePerms = this.permissions[role] || this.permissions.viewer;
    return !!rolePerms[permissionName];
  }

  // Update UI Elements based on current active user's permissions
  applyPermissionsToUI() {
    const currentUser = this.getCurrentUser();
    const role = currentUser ? currentUser.role : "viewer";

    // 1. Update Profile Card in Sidebar
    const avatarEl = document.getElementById("currentUserAvatar");
    const nameEl = document.getElementById("currentUserName");
    const roleBadgeEl = document.getElementById("currentUserRoleBadge");

    if (avatarEl && currentUser) {
      avatarEl.textContent = currentUser.name.charAt(0);
      nameEl.textContent = currentUser.name;
      
      let roleText = "最高管理員";
      if (role === "editor") roleText = "庫存管理員";
      if (role === "viewer") roleText = "救護人員 (僅瀏覽)";

      roleBadgeEl.textContent = roleText;
    }

    // 2. Control Add Supply Buttons
    const addBtns = document.querySelectorAll(".rbac-add");
    addBtns.forEach(btn => {
      btn.style.display = this.hasPermission("canAddSupply") ? "inline-flex" : "none";
    });

    // 3. Control Import Buttons
    const importBtns = document.querySelectorAll(".rbac-import");
    importBtns.forEach(btn => {
      btn.style.display = this.hasPermission("canImportExcel") ? "inline-flex" : "none";
    });

    // 4. Control Manage Users Buttons
    const userBtns = document.querySelectorAll(".rbac-manage-users");
    userBtns.forEach(btn => {
      btn.style.display = this.hasPermission("canManageUsers") ? "inline-flex" : "none";
    });

    // 5. Control Config Form Inputs & Submit Buttons
    const configBtns = document.querySelectorAll(".rbac-config");
    configBtns.forEach(btn => {
      btn.disabled = !this.hasPermission("canConfigureReminders");
    });
  }

  // Check action or trigger toast warning if permission denied
  checkActionAllowed(permissionName, actionLabel = "該項功能") {
    if (this.hasPermission(permissionName)) {
      return true;
    }
    const currentUser = this.getCurrentUser();
    showToast(`權限不足：您目前的權限為【${currentUser.role}】，無法執行${actionLabel}。`, "danger");
    return false;
  }
}

const rbac = new RBAC();
