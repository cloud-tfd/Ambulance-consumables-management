/* ==========================================================================
   EMS Consumables Management System - Firebase Authentication & Security Manager
   ========================================================================== */

// Firebase Configuration provided by user
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC15f9q_9MR8EQrL0hglMX2F67eWVnWti8",
  authDomain: "consumables-management-c7aaa.firebaseapp.com",
  databaseURL: "https://consumables-management-c7aaa-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "consumables-management-c7aaa",
  storageBucket: "consumables-management-c7aaa.firebasestorage.app",
  messagingSenderId: "1010341726098",
  appId: "1:1010341726098:web:66491ea68196cbba68234b",
  measurementId: "G-41KY5B6DEW"
};

class AuthManager {
  constructor() {
    this.auth = null;
    this.currentUser = null;
    this.idToken = null;
    this.isInitialized = false;
    this.authListeners = [];

    this._initFirebase();
  }

  _initFirebase() {
    try {
      if (typeof firebase !== "undefined") {
        if (!firebase.apps.length) {
          firebase.initializeApp(FIREBASE_CONFIG);
        }
        this.auth = firebase.auth();
        this.isInitialized = true;

        // Listen to Auth State Changes
        this.auth.onAuthStateChanged(async (user) => {
          this.currentUser = user;
          if (user) {
            try {
              this.idToken = await user.getIdToken();
            } catch (err) {
              console.warn("[AuthManager] Failed to get ID token:", err);
            }
            this._onUserLoggedIn(user);
          } else {
            this.idToken = null;
            this._onUserLoggedOut();
          }

          // Trigger registered callbacks
          this.authListeners.forEach(cb => {
            try { cb(user); } catch (e) { console.error(e); }
          });
        });
      } else {
        console.warn("[AuthManager] Firebase SDK not loaded.");
      }
    } catch (err) {
      console.error("[AuthManager] Initialization error:", err);
    }
  }

  onAuthStateChanged(callback) {
    if (typeof callback === "function") {
      this.authListeners.push(callback);
      if (this.isInitialized && this.currentUser !== undefined) {
        callback(this.currentUser);
      }
    }
  }

  isLoggedIn() {
    return !!this.currentUser;
  }

  async getCurrentIdToken(forceRefresh = false) {
    if (!this.auth) return null;
    const user = this.auth.currentUser || this.currentUser;
    if (!user) return null;
    try {
      this.idToken = await user.getIdToken(forceRefresh);
      return this.idToken;
    } catch (err) {
      console.warn("[AuthManager] Error refreshing token:", err);
      return this.idToken || null;
    }
  }

  async loginWithEmail(email, password) {
    if (!this.auth) {
      throw new Error("Firebase 驗證服務尚未就緒，請檢查網路連線");
    }

    const cleanEmail = (email || "").trim();
    const cleanPassword = (password || "").trim();

    if (!cleanEmail) throw new Error("請輸入電子郵件信箱");
    if (!cleanPassword) throw new Error("請輸入密碼");

    try {
      const userCredential = await this.auth.signInWithEmailAndPassword(cleanEmail, cleanPassword);
      this.currentUser = userCredential.user;
      this.idToken = await userCredential.user.getIdToken();
      return userCredential.user;
    } catch (err) {
      console.error("[AuthManager] Login error:", err);
      throw new Error(this._getFriendlyErrorMessage(err.code, err.message));
    }
  }

  async logout() {
    if (!this.auth) return;
    try {
      await this.auth.signOut();
      this.currentUser = null;
      this.idToken = null;
    } catch (err) {
      console.error("[AuthManager] Logout error:", err);
    }
  }

  async sendPasswordReset(email) {
    if (!this.auth) throw new Error("Firebase 尚未就緒");
    const cleanEmail = (email || "").trim();
    if (!cleanEmail) throw new Error("請先輸入欲重設密碼的電子郵件信箱");

    try {
      await this.auth.sendPasswordResetEmail(cleanEmail);
      return true;
    } catch (err) {
      console.error("[AuthManager] Password reset error:", err);
      throw new Error(this._getFriendlyErrorMessage(err.code, err.message));
    }
  }

  async _onUserLoggedIn(user) {
    console.log("[AuthManager] User logged in:", user.email);

    // Hide login overlay
    const overlay = document.getElementById("loginOverlay");
    if (overlay) {
      overlay.classList.remove("active");
      overlay.style.display = "none";
    }

    // 1. FIRST: Always pull latest authoritative data from Firebase Cloud before touching local state!
    if (typeof sync !== "undefined" && sync.pullFromCloud) {
      try {
        await sync.pullFromCloud(true);
      } catch (e) {
        console.warn("[AuthManager] Initial pull error:", e);
      }
    }

    // 2. Match or create user profile in store (WITHOUT triggering an immediate sync overwrite)
    if (typeof store !== "undefined") {
      const users = store.getUsers();
      let matchedUser = users.find(u => (u.email || "").toLowerCase() === (user.email || "").toLowerCase());

      if (!matchedUser) {
        // Create matching admin profile for authenticated Firebase user
        const newProfile = {
          id: "usr-" + Date.now(),
          name: user.displayName || user.email.split("@")[0] + " 隊員",
          email: user.email,
          dept: "救護分隊",
          role: "admin"
        };
        users.push(newProfile);
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
        store.setCurrentUser(newProfile.id);
      } else {
        const hasAdmin = users.some(u => u.role === "admin");
        if (!hasAdmin) {
          matchedUser.role = "admin";
          localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
        }
        store.setCurrentUser(matchedUser.id);
      }
    }

    // 3. Update UI
    this._updateCurrentUserUI(user);

    // 4. Start active polling
    if (typeof sync !== "undefined" && sync.startPolling) {
      sync.startPolling();
    }
    if (typeof renderAllViews === "function") {
      renderAllViews();
    }
    if (typeof showToast === "function") {
      showToast(`登入成功！歡迎【${user.email}】`, "success");
    }
  }

  _onUserLoggedOut() {
    console.log("[AuthManager] User logged out");

    // Show login overlay
    const overlay = document.getElementById("loginOverlay");
    if (overlay) {
      overlay.classList.add("active");
      overlay.style.display = "flex";
    }

    // Clear password input
    const pwdInput = document.getElementById("loginPassword");
    if (pwdInput) pwdInput.value = "";

    const errAlert = document.getElementById("loginErrorAlert");
    if (errAlert) errAlert.style.display = "none";

    if (typeof sync !== "undefined" && sync.pollInterval) {
      clearInterval(sync.pollInterval);
    }
  }

  _updateCurrentUserUI(user) {
    const avatarEl = document.getElementById("currentUserAvatar");
    const nameEl = document.getElementById("currentUserName");
    const roleEl = document.getElementById("currentUserRoleBadge");

    if (typeof store !== "undefined") {
      const current = store.getCurrentUser();
      if (current) {
        if (avatarEl) avatarEl.textContent = current.name.charAt(0);
        if (nameEl) nameEl.textContent = current.name;
        if (roleEl) {
          roleEl.textContent = current.role === "admin" ? "最高管理員" : (current.role === "editor" ? "庫存管理員" : "救護隊員");
        }
        return;
      }
    }

    if (avatarEl) avatarEl.textContent = (user.email || "管").charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = user.displayName || user.email;
    if (roleEl) roleEl.textContent = "已驗證管理員";
  }

  _getFriendlyErrorMessage(code, rawMsg) {
    switch (code) {
      case "auth/invalid-email":
        return "電子郵件格式不正確，請確認輸入無誤。";
      case "auth/user-disabled":
        return "此帳號已被停用，請聯繫系統管理員。";
      case "auth/user-not-found":
        return "查無此帳號！請確認 Email 或至 Firebase Console 建立。";
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "帳號或密碼錯誤，請重新確認。";
      case "auth/too-many-requests":
        return "登入失敗次數過多，為維護安全系統已暫時鎖定，請稍候再試。";
      case "auth/network-request-failed":
        return "網路連線失敗，請檢查網路狀態。";
      default:
        return rawMsg || "登入失敗，請確認帳號密碼。";
    }
  }
}

// Singleton instance
var authManager = new AuthManager();
