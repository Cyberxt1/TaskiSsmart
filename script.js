const firebaseConfig = {
  apiKey: "AIzaSyASjLfdanR3rskvdxtmoQ6Jaq-HtHmLZxI",
  authDomain: "taskismart.firebaseapp.com",
  projectId: "taskismart",
  storageBucket: "taskismart.firebasestorage.app",
  messagingSenderId: "96628595458",
  appId: "1:96628595458:web:573af33070f8680314401b"
};

let auth = null;
let db = null;
let initializeAppRef = null;
let getAuthRef = null;
let onAuthStateChangedRef = null;
let createUserWithEmailAndPasswordRef = null;
let signInWithEmailAndPasswordRef = null;
let signOutRef = null;
let initializeFirestoreRef = null;
let persistentLocalCacheRef = null;
let persistentMultipleTabManagerRef = null;
let docRef = null;
let setDocRef = null;
let getDocRef = null;
let updateDocRef = null;
let deleteDocRef = null;
let collectionRef = null;
let onSnapshotRef = null;
let queryRef = null;
let orderByRef = null;
let firebaseLoadPromise = null;

const starsContainer = document.getElementById("stars");
const page = window.location.pathname.split("/").pop() || "index.html";
const protectedPages = new Set(["dashboard.html", "tasks.html", "profile.html"]);
const authPages = new Set(["login.html", "signup.html"]);
const OFFLINE_TASK_QUEUE_KEY = "taskmaster-offline-tasks";
const CACHED_TASKS_KEY = "taskmaster-cached-tasks";
const CACHED_PROFILE_KEY = "taskmaster-cached-profiles";
const SESSION_KEY = "taskmaster-session";

const state = {
  user: null,
  profile: null,
  tasks: [],
  offlineTasks: [],
  activeFilter: "all",
  tasksBound: false,
  profileBound: false,
  loginBound: false,
  signupBound: false,
  isOnline: navigator.onLine,
  syncInFlight: false,
  firebaseReady: false,
  authObserverBound: false
};

async function loadFirebase() {
  if (state.firebaseReady) {
    return true;
  }

  if (!firebaseLoadPromise) {
    firebaseLoadPromise = Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
    ]).then(([appModule, authModule, firestoreModule]) => {
      initializeAppRef = appModule.initializeApp;
      getAuthRef = authModule.getAuth;
      onAuthStateChangedRef = authModule.onAuthStateChanged;
      createUserWithEmailAndPasswordRef = authModule.createUserWithEmailAndPassword;
      signInWithEmailAndPasswordRef = authModule.signInWithEmailAndPassword;
      signOutRef = authModule.signOut;

      initializeFirestoreRef = firestoreModule.initializeFirestore;
      persistentLocalCacheRef = firestoreModule.persistentLocalCache;
      persistentMultipleTabManagerRef = firestoreModule.persistentMultipleTabManager;
      docRef = firestoreModule.doc;
      setDocRef = firestoreModule.setDoc;
      getDocRef = firestoreModule.getDoc;
      updateDocRef = firestoreModule.updateDoc;
      deleteDocRef = firestoreModule.deleteDoc;
      collectionRef = firestoreModule.collection;
      onSnapshotRef = firestoreModule.onSnapshot;
      queryRef = firestoreModule.query;
      orderByRef = firestoreModule.orderBy;

      const app = initializeAppRef(firebaseConfig);
      auth = getAuthRef(app);
      db = initializeFirestoreRef(app, {
        localCache: persistentLocalCacheRef({
          tabManager: persistentMultipleTabManagerRef()
        })
      });

      state.firebaseReady = true;
      return true;
    }).catch((error) => {
      firebaseLoadPromise = null;
      throw error;
    });
  }

  try {
    await firebaseLoadPromise;
    return true;
  } catch {
    return false;
  }
}

if (starsContainer && !starsContainer.hasAttribute("data-disabled")) {
  const starCount = 44;

  for (let i = 0; i < starCount; i += 1) {
    const star = document.createElement("span");
    star.className = "star";
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.opacity = (Math.random() * 0.5 + 0.2).toFixed(2);
    star.style.animationDelay = `${Math.random() * 5}s`;
    star.style.animationDuration = `${4 + Math.random() * 4}s`;
    starsContainer.appendChild(star);
  }
}

function redirectTo(url) {
  if (page !== url) {
    window.location.href = url;
  }
}

function setButtonLoading(button, isLoading) {
  if (!button) {
    return;
  }

  button.classList.toggle("is-loading", isLoading);
  button.disabled = isLoading;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Ignore service worker registration failures.
    });
  }, { once: true });
}

function warmOfflineShell() {
  if (!("caches" in window)) {
    return;
  }

  const shellAssets = [
    "./index.html",
    "./dashboard.html",
    "./tasks.html",
    "./profile.html",
    "./login.html",
    "./signup.html",
    "./styles.css",
    "./auth.css",
    "./script.js",
    "./icon.png",
    "./icon.jpeg"
  ];

  caches.open("taskmaster-shell-v2")
    .then((cache) => cache.addAll(shellAssets))
    .catch(() => {
      // Ignore cache warmup failures and let the service worker retry later.
    });
}

function updateOnlineState() {
  const statusElements = document.querySelectorAll("[data-online-status]");
  const dotElements = document.querySelectorAll("[data-online-dot]");
  const unsyncedCount = state.offlineTasks.length;
  let label = state.isOnline ? "Online" : "Offline";

  if (unsyncedCount > 0) {
    if (!state.isOnline) {
      label = `${unsyncedCount} pending offline`;
    } else if (state.syncInFlight) {
      label = `Syncing ${unsyncedCount} pending`;
    } else {
      label = `${unsyncedCount} pending`;
    }
  }

  statusElements.forEach((element) => {
    element.textContent = label;
  });

  dotElements.forEach((element) => {
    element.classList.toggle("offline", !state.isOnline);
  });
}

function readLocalJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures so the app can keep running in memory.
  }
}

function getOfflineQueue() {
  return readLocalJson(OFFLINE_TASK_QUEUE_KEY);
}

function setOfflineQueue(queue) {
  writeLocalJson(OFFLINE_TASK_QUEUE_KEY, queue);
}

function getCachedTasksMap() {
  return readLocalJson(CACHED_TASKS_KEY);
}

function persistCachedTasks(userId, tasks) {
  const cachedTasks = getCachedTasksMap();

  if (tasks.length > 0) {
    cachedTasks[userId] = tasks;
  } else {
    delete cachedTasks[userId];
  }

  writeLocalJson(CACHED_TASKS_KEY, cachedTasks);
}

function loadCachedTasks(userId) {
  const cachedTasks = getCachedTasksMap();
  const tasks = Array.isArray(cachedTasks[userId]) ? cachedTasks[userId] : [];
  state.tasks = tasks.filter((task) => task && typeof task === "object" && task.id);
}

function getCachedProfilesMap() {
  return readLocalJson(CACHED_PROFILE_KEY);
}

function persistCachedProfile(userId, profile) {
  const cachedProfiles = getCachedProfilesMap();

  if (profile && typeof profile === "object") {
    cachedProfiles[userId] = profile;
  } else {
    delete cachedProfiles[userId];
  }

  writeLocalJson(CACHED_PROFILE_KEY, cachedProfiles);
}

function loadCachedProfile(userId) {
  const cachedProfiles = getCachedProfilesMap();
  state.profile = cachedProfiles[userId] || null;
}

function clearCachedUserData(userId) {
  if (!userId) {
    return;
  }

  const cachedTasks = getCachedTasksMap();
  const cachedProfiles = getCachedProfilesMap();
  const offlineQueue = getOfflineQueue();

  delete cachedTasks[userId];
  delete cachedProfiles[userId];
  delete offlineQueue[userId];

  writeLocalJson(CACHED_TASKS_KEY, cachedTasks);
  writeLocalJson(CACHED_PROFILE_KEY, cachedProfiles);
  setOfflineQueue(offlineQueue);
}

function cacheSession(user) {
  if (!user?.uid) {
    return;
  }

  writeLocalJson(SESSION_KEY, {
    uid: user.uid,
    email: user.email || ""
  });
}

function clearCachedSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function readCachedSession() {
  const session = readLocalJson(SESSION_KEY);
  return session.uid ? session : null;
}

function restoreCachedUser() {
  const session = readCachedSession();

  if (!session) {
    return null;
  }

  return {
    uid: session.uid,
    email: session.email || ""
  };
}

function loadOfflineTasks(userId) {
  const queue = getOfflineQueue();
  const tasks = Array.isArray(queue[userId]) ? queue[userId] : [];

  state.offlineTasks = tasks
    .filter((task) => task && typeof task === "object" && task.id)
    .map((task) => ({
      ...task,
      syncStatus: task.syncStatus || "pending"
    }));
}

function persistOfflineTasks(userId) {
  const queue = getOfflineQueue();

  if (state.offlineTasks.length > 0) {
    queue[userId] = state.offlineTasks;
  } else {
    delete queue[userId];
  }

  setOfflineQueue(queue);
  updateOnlineState();
}

function createLocalTaskId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildTaskPayload(formData) {
  return {
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    priority: String(formData.get("priority") || "medium").toLowerCase(),
    deadline: normalizeDateInput(String(formData.get("deadline") || "").trim()),
    category: String(formData.get("category") || "").trim(),
    completed: false,
    createdAt: new Date().toISOString(),
    completedAt: null
  };
}

function queueOfflineTask(userId, task) {
  state.offlineTasks = [task, ...state.offlineTasks.filter((item) => item.id !== task.id)];
  persistOfflineTasks(userId);
  renderTasks();
  renderDashboard();
}

function updateOfflineTask(userId, taskId, updater) {
  const nextTasks = state.offlineTasks.map((task) => (
    task.id === taskId ? { ...task, ...updater(task) } : task
  ));

  state.offlineTasks = nextTasks;
  persistOfflineTasks(userId);
  renderTasks();
  renderDashboard();
}

function removeOfflineTask(userId, taskId) {
  state.offlineTasks = state.offlineTasks.filter((task) => task.id !== taskId);
  persistOfflineTasks(userId);
  renderTasks();
  renderDashboard();
}

function getVisibleTasks() {
  const syncedTaskIds = new Set(state.tasks.map((task) => task.id));
  const pendingOnly = state.offlineTasks.filter((task) => !syncedTaskIds.has(task.id));
  return [...pendingOnly, ...state.tasks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function syncOfflineTasks(user) {
  if (!user || !state.isOnline || !state.firebaseReady || state.syncInFlight || state.offlineTasks.length === 0) {
    updateOnlineState();
    return;
  }

  state.syncInFlight = true;
  updateOnlineState();

  const pendingTasks = [...state.offlineTasks];
  const remainingTasks = [];

  for (const task of pendingTasks) {
    try {
      const { id, syncStatus: _syncStatus, ...taskPayload } = task;
      await setDocRef(docRef(db, "users", user.uid, "tasks", id), taskPayload, { merge: true });
    } catch {
      remainingTasks.push(task);
    }
  }

  state.offlineTasks = remainingTasks;
  persistOfflineTasks(user.uid);
  state.syncInFlight = false;
  updateOnlineState();
}

function messageFromFirebaseError(error, mode = "signup") {
  const code = error?.code || "";

  if (code === "auth/email-already-in-use") {
    return "That email is already in use.";
  }

  if (code === "auth/weak-password") {
    return "Password should be at least 6 characters.";
  }

  if (code === "auth/invalid-email") {
    return "Please enter a valid email address.";
  }

  if (code === "auth/operation-not-allowed") {
    return "Enable Email/Password sign-in in Firebase Authentication.";
  }

  if (code === "auth/network-request-failed") {
    return "Network error. Check your connection and try again.";
  }

  if (mode === "login") {
    if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
      return "Invalid email or password.";
    }
  }

  return mode === "signup"
    ? "Could not create account right now. Check Firebase Auth setup and try again."
    : "Could not sign in right now. Please try again.";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeDateInput(value) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!slashMatch) {
    return value.trim();
  }

  const [, month, day, year] = slashMatch;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function formatDeadline(dateValue) {
  if (!dateValue) {
    return "No deadline";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const [year, month, day] = dateValue.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (!Number.isNaN(date.getTime())) {
      return `Due ${date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      })}`;
    }
  }

  return `Due ${dateValue}`;
}

function tasksDoneToday(tasks) {
  const today = new Date().toISOString().slice(0, 10);
  return tasks.filter((task) => task.completed && task.completedAt && task.completedAt.slice(0, 10) === today).length;
}

function computeStreak(tasks) {
  const completedDates = tasks
    .filter((task) => task.completed && task.completedAt)
    .map((task) => task.completedAt.slice(0, 10));

  const uniqueDates = [...new Set(completedDates)].sort();

  if (uniqueDates.length === 0) {
    return { current: 0, longest: 0 };
  }

  let longest = 1;
  let run = 1;

  for (let i = 1; i < uniqueDates.length; i += 1) {
    const previous = new Date(uniqueDates[i - 1]);
    const current = new Date(uniqueDates[i]);
    const diffDays = Math.round((current - previous) / 86400000);

    if (diffDays === 1) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (diffDays > 1) {
      run = 1;
    }
  }

  let current = 0;
  const today = new Date();
  const lastDate = new Date(uniqueDates[uniqueDates.length - 1]);
  const diffFromToday = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()) -
      new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate())) / 86400000
  );

  if (diffFromToday === 0 || diffFromToday === 1) {
    current = 1;

    for (let i = uniqueDates.length - 1; i > 0; i -= 1) {
      const now = new Date(uniqueDates[i]);
      const prev = new Date(uniqueDates[i - 1]);
      const diffDays = Math.round((now - prev) / 86400000);

      if (diffDays === 1) {
        current += 1;
      } else {
        break;
      }
    }
  }

  return { current, longest };
}

function streakIconMarkup(streak) {
  if (streak <= 1) {
    return {
      tier: "tier-fire",
      svg: `
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 3C9.2 6.1 8 8.4 8 10.8C8 13.6 9.9 15.5 12.3 15.5C14.7 15.5 16.5 13.7 16.5 11.4C16.5 9.4 15.4 7.7 12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M10 18.5C10.8 19.4 12 20 13.4 20C16 20 18 18.1 18 15.8C18 14.6 17.5 13.5 16.6 12.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      `
    };
  }

  if (streak === 2) {
    return {
      tier: "tier-star",
      svg: `
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 3.8L14.3 8.5L19.5 9.2L15.8 12.9L16.7 18.1L12 15.6L7.3 18.1L8.2 12.9L4.5 9.2L9.7 8.5L12 3.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      `
    };
  }

  if (streak === 3) {
    return {
      tier: "tier-bolt",
      svg: `
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M13 3L6 13H11L10 21L18 10H13V3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      `
    };
  }

  if (streak === 4) {
    return {
      tier: "tier-crown",
      svg: `
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M5 17L3.8 8L8.8 11.5L12 6L15.2 11.5L20.2 8L19 17H5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M5 20H19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      `
    };
  }

  if (streak === 5) {
    return {
      tier: "tier-rocket",
      svg: `
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M14.5 4.5C17.7 5.4 19.6 8.3 19.5 11.5C16.3 11.6 13.4 9.7 12.5 6.5C13 5.7 13.7 5 14.5 4.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M12.5 6.5L8.5 10.5M10 14L6 18M7 9L4 12M13 17L15 20L16.5 16.5L20 15L17 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `
    };
  }

  if (streak === 6) {
    return {
      tier: "tier-diamond",
      svg: `
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M7 5H17L20 10L12 19L4 10L7 5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M9 5L12 19L15 5M4 10H20" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      `
    };
  }

  return {
    tier: "tier-trophy",
    svg: `
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M8 4H16V8C16 10.2 14.2 12 12 12C9.8 12 8 10.2 8 8V4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M16 5H19V6C19 8.2 17.2 10 15 10M8 5H5V6C5 8.2 6.8 10 9 10M12 12V16M9 20H15M10 16H14V20H10V16Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `
  };
}

function updateLandingLinks(isLoggedIn) {
  if (page !== "index.html") {
    return;
  }

  const loginLink = document.querySelector(".top-login");
  const getStartedLink = document.querySelector(".primary-action");
  const ctaLink = document.querySelector(".cta-button");

  if (loginLink) {
    loginLink.href = isLoggedIn ? "dashboard.html" : "login.html";
    const label = loginLink.querySelector("span");
    if (label) {
      label.textContent = isLoggedIn ? "Dashboard" : "Log In";
    }
  }

  if (getStartedLink) {
    getStartedLink.href = isLoggedIn ? "dashboard.html" : "signup.html";
  }

  if (ctaLink) {
    ctaLink.href = isLoggedIn ? "dashboard.html" : "signup.html";
  }
}

function updateWelcomeCopy() {
  const name = state.profile?.fullName?.trim() || state.profile?.email?.trim() || "there";
  const greeting = `Welcome, ${name}`;
  const panelGreeting = document.getElementById("panel-greeting");
  const pageWelcome = document.getElementById("page-welcome");

  if (panelGreeting) {
    panelGreeting.textContent = greeting;
  }

  if (pageWelcome) {
    pageWelcome.textContent = greeting;
  }
}

function createTaskMarkup(task) {
  const checked = task.completed ? "checked" : "";
  const syncBadge = task.syncStatus === "pending"
    ? '<span class="task-sync-chip">Pending sync</span>'
    : "";

  return `
    <article class="task-row-card${task.completed ? " is-complete" : ""}" data-task-id="${task.id}">
      <label class="task-row-check" aria-label="Mark ${escapeHtml(task.title)} complete">
        <input type="checkbox" ${checked}>
        <span></span>
      </label>

      <div class="task-row-content">
        <h2>${escapeHtml(task.title)}</h2>
        <p>${escapeHtml(task.description || "No description")}</p>
        <div class="task-row-meta">
          <span>${escapeHtml(formatDeadline(task.deadline))}</span>
          <span class="task-category-chip">${escapeHtml(task.category || "General")}</span>
          ${syncBadge}
        </div>
      </div>

      <div class="task-row-actions">
        <span class="task-priority-chip">${escapeHtml(task.priority)}</span>
        <button class="task-delete-btn" type="button" aria-label="Delete task">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 7H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M9 7V5C9 4.4 9.4 4 10 4H14C14.6 4 15 4.4 15 5V7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M7 7L8 19C8 19.6 8.4 20 9 20H15C15.6 20 16 19.6 16 19L17 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 11V16M14 11V16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </article>
  `;
}

function renderTasks() {
  const taskList = document.getElementById("task-list");
  const emptyState = document.getElementById("tasks-empty");

  if (!taskList || !emptyState) {
    return;
  }

  const filteredTasks = getVisibleTasks().filter((task) => {
    if (state.activeFilter === "pending") {
      return !task.completed;
    }

    if (state.activeFilter === "completed") {
      return task.completed;
    }

    return true;
  });

  taskList.innerHTML = filteredTasks.map(createTaskMarkup).join("");
  emptyState.classList.toggle("hidden", filteredTasks.length > 0);
}

function renderDashboard() {
  const totalTasksCount = document.getElementById("total-tasks-count");
  const completedTasksCount = document.getElementById("completed-tasks-count");
  const streakCount = document.getElementById("streak-count");
  const longestStreak = document.getElementById("longest-streak");
  const todayTaskCount = document.getElementById("today-task-count");
  const recentTasksList = document.getElementById("recent-tasks-list");
  const recentEmptyState = document.getElementById("recent-empty-state");
  const streakSymbol = document.getElementById("streak-symbol");
  const streakBarGroup = document.getElementById("streak-bar-group");

  if (!totalTasksCount || !completedTasksCount || !recentTasksList || !recentEmptyState) {
    return;
  }

  const visibleTasks = getVisibleTasks();
  const completed = visibleTasks.filter((task) => task.completed).length;
  const streak = computeStreak(visibleTasks);

  totalTasksCount.textContent = String(visibleTasks.length);
  completedTasksCount.textContent = String(completed);
  streakCount.textContent = String(streak.current);
  longestStreak.textContent = `${streak.longest} days`;
  todayTaskCount.textContent = `${tasksDoneToday(visibleTasks)} tasks done today`;

  if (streakSymbol) {
    const iconState = streakIconMarkup(streak.current);
    streakSymbol.className = `stat-symbol streak ${iconState.tier}`;
    streakSymbol.innerHTML = iconState.svg;
  }

  if (streakBarGroup) {
    const activeBars = Math.min(streak.current, 7);
    [...streakBarGroup.children].forEach((bar, index) => {
      bar.classList.toggle("active", index < activeBars);
    });
  }

  const recentTasks = [...visibleTasks]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 4);

  if (recentTasks.length === 0) {
    recentTasksList.innerHTML = "";
    recentEmptyState.classList.remove("hidden");
    return;
  }

  recentEmptyState.classList.add("hidden");
  recentTasksList.innerHTML = recentTasks
    .map((task) => `
      <article class="recent-task-item">
        <div class="recent-task-copy">
          <strong>${escapeHtml(task.title)}</strong>
          <span>${escapeHtml(formatDeadline(task.deadline))}</span>
        </div>
        <span class="recent-task-status ${task.completed ? "completed" : "pending"}">
          ${task.completed ? "Completed" : "Pending"}
        </span>
      </article>
    `)
    .join("");
}

function hydrateProfileForm() {
  const profileForm = document.getElementById("profile-form");

  if (!profileForm || !state.profile) {
    return;
  }

  const emailInput = profileForm.elements.namedItem("email");
  const fullNameInput = profileForm.elements.namedItem("fullName");
  const universityInput = profileForm.elements.namedItem("university");

  if (emailInput) {
    emailInput.value = state.profile.email || state.user?.email || "";
  }

  if (fullNameInput) {
    fullNameInput.value = state.profile.fullName || "";
  }

  if (universityInput) {
    universityInput.value = state.profile.university || "";
  }

  updateWelcomeCopy();
}

async function ensureUserProfile(user) {
  if (!state.firebaseReady) {
    loadCachedProfile(user.uid);
    hydrateProfileForm();
    return;
  }

  const userRef = docRef(db, "users", user.uid);
  const snapshot = await getDocRef(userRef);

  if (!snapshot.exists()) {
    return;
  }

  state.profile = snapshot.data();
  persistCachedProfile(user.uid, state.profile);
  hydrateProfileForm();
}

function bindTaskStream(user) {
  if (state.tasksBound || !state.firebaseReady) {
    return;
  }

  state.tasksBound = true;
  loadOfflineTasks(user.uid);
  loadCachedTasks(user.uid);
  updateOnlineState();
  const tasksQuery = queryRef(
    collectionRef(db, "users", user.uid, "tasks"),
    orderByRef("createdAt", "desc")
  );

  onSnapshotRef(tasksQuery, (snapshot) => {
    state.tasks = snapshot.docs.map((taskDoc) => ({
      id: taskDoc.id,
      ...taskDoc.data()
    }));
    persistCachedTasks(user.uid, state.tasks);

    const syncedTaskIds = new Set(state.tasks.map((task) => task.id));

    if (syncedTaskIds.size > 0 && state.offlineTasks.length > 0) {
      state.offlineTasks = state.offlineTasks.filter((task) => !syncedTaskIds.has(task.id));
      persistOfflineTasks(user.uid);
    }

    renderTasks();
    renderDashboard();
    syncOfflineTasks(user);
  });
}

function initTasksPage(user) {
  const taskList = document.getElementById("task-list");
  const emptyState = document.getElementById("tasks-empty");
  const taskForm = document.getElementById("task-form");
  const filterButtons = document.querySelectorAll("[data-filter]");

  if (!taskList || !emptyState || !taskForm || state.tasksBound && page === "tasks.html") {
    if (taskList && emptyState) {
      renderTasks();
    }
  }

  if (!taskList || !emptyState || !taskForm) {
    return;
  }

  if (!taskForm.dataset.bound) {
    taskForm.dataset.bound = "true";

    taskForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = taskForm.querySelector(".create-modal-submit");

      const formData = new FormData(taskForm);
      const title = String(formData.get("title") || "").trim();

      if (!title) {
        return;
      }

      setButtonLoading(submitButton, true);

      try {
        const taskId = createLocalTaskId();
        const payload = buildTaskPayload(formData);

        if (state.isOnline && state.firebaseReady) {
          try {
            await setDocRef(docRef(db, "users", user.uid, "tasks", taskId), payload);
          } catch {
            queueOfflineTask(user.uid, {
              id: taskId,
              ...payload,
              syncStatus: "pending"
            });
          }
        } else {
          queueOfflineTask(user.uid, {
            id: taskId,
            ...payload,
            syncStatus: "pending"
          });
        }

        taskForm.reset();
        window.location.hash = "";
      } finally {
        setButtonLoading(submitButton, false);
      }
    });
  }

  filterButtons.forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      state.activeFilter = button.dataset.filter || "all";
      filterButtons.forEach((chip) => chip.classList.toggle("active", chip === button));
      renderTasks();
    });
  });

  if (!taskList.dataset.bound) {
    taskList.dataset.bound = "true";

    taskList.addEventListener("click", async (event) => {
      const taskCard = event.target.closest("[data-task-id]");

      if (!taskCard) {
        return;
      }

      const taskId = taskCard.dataset.taskId;
      const task = getVisibleTasks().find((item) => item.id === taskId);

      if (!task) {
        return;
      }

      if (task.syncStatus === "pending") {
        if (event.target.closest(".task-delete-btn")) {
          removeOfflineTask(user.uid, taskId);
          return;
        }

        if (event.target.closest(".task-row-check")) {
          updateOfflineTask(user.uid, taskId, (currentTask) => ({
            completed: !currentTask.completed,
            completedAt: !currentTask.completed ? new Date().toISOString() : null
          }));
        }

        return;
      }

      if (!state.isOnline || !state.firebaseReady) {
        return;
      }

      const taskRef = docRef(db, "users", user.uid, "tasks", taskId);

      if (event.target.closest(".task-delete-btn")) {
        await deleteDocRef(taskRef);
        return;
      }

      if (event.target.closest(".task-row-check")) {
        await updateDocRef(taskRef, {
          completed: !task.completed,
          completedAt: !task.completed ? new Date().toISOString() : null
        });
      }
    });
  }

  renderTasks();
}

function initDashboardPage() {
  if (page !== "dashboard.html") {
    return;
  }

  renderDashboard();
  updateWelcomeCopy();
}

function initProfilePage(user) {
  const profileForm = document.getElementById("profile-form");
  const signOutButton = document.getElementById("signout-btn");

  if (!profileForm || !signOutButton || state.profileBound) {
    hydrateProfileForm();
    return;
  }

  state.profileBound = true;
  hydrateProfileForm();

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = profileForm.querySelector(".save-btn");
    setButtonLoading(submitButton, true);

    const formData = new FormData(profileForm);
    const nextProfile = {
      email: state.profile?.email || state.user?.email || "",
      fullName: String(formData.get("fullName") || "").trim(),
      university: String(formData.get("university") || "").trim()
    };

    try {
      state.profile = { ...state.profile, ...nextProfile };
      persistCachedProfile(user.uid, state.profile);

      if (state.isOnline && state.firebaseReady) {
        await updateDocRef(docRef(db, "users", user.uid), nextProfile);
      }

      hydrateProfileForm();
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  signOutButton.addEventListener("click", async () => {
    setButtonLoading(signOutButton, true);

    try {
      clearCachedUserData(user.uid);

      if (state.firebaseReady) {
        await signOutRef(auth);
      } else {
        clearCachedSession();
      }

      redirectTo("index.html");
    } finally {
      setButtonLoading(signOutButton, false);
    }
  });
}

function initSignupPage() {
  const signupForm = document.getElementById("signup-form");
  const message = document.getElementById("signup-message");

  if (!signupForm || state.signupBound) {
    return;
  }

  state.signupBound = true;

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = signupForm.querySelector(".auth-submit");
    if (message) {
      message.textContent = "";
    }

    const formData = new FormData(signupForm);
    const fullName = String(formData.get("fullName") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "").trim();

    if (!fullName || !email || !password) {
      if (message) {
        message.textContent = "Please complete all fields.";
      }
      return;
    }

    setButtonLoading(submitButton, true);

    try {
      if (!state.firebaseReady && !await loadFirebase()) {
        throw new Error("offline-auth");
      }

      const credentials = await createUserWithEmailAndPasswordRef(auth, email, password);

      await setDocRef(docRef(db, "users", credentials.user.uid), {
        email,
        fullName,
        university: "",
        createdAt: new Date().toISOString()
      });

      redirectTo("dashboard.html");
    } catch (error) {
      if (message) {
        message.textContent = error?.message === "offline-auth"
          ? "Signup needs internet the first time so Firebase can connect."
          : messageFromFirebaseError(error, "signup");
      }
    } finally {
      setButtonLoading(submitButton, false);
    }
  });
}

function initLoginPage() {
  const loginForm = document.getElementById("login-form");
  const message = document.getElementById("login-message");

  if (!loginForm || state.loginBound) {
    return;
  }

  state.loginBound = true;

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = loginForm.querySelector(".auth-submit");
    if (message) {
      message.textContent = "";
    }

    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "").trim();

    setButtonLoading(submitButton, true);

    try {
      if (!state.firebaseReady && !await loadFirebase()) {
        throw new Error("offline-auth");
      }

      await signInWithEmailAndPasswordRef(auth, email, password);
      redirectTo("dashboard.html");
    } catch (error) {
      if (message) {
        message.textContent = error?.message === "offline-auth"
          ? "Login needs internet the first time so Firebase can connect."
          : messageFromFirebaseError(error, "login");
      }
    } finally {
      setButtonLoading(submitButton, false);
    }
  });
}

function bootCachedSession() {
  const cachedUser = restoreCachedUser();

  if (!cachedUser) {
    return false;
  }

  state.user = cachedUser;
  loadCachedProfile(cachedUser.uid);
  loadCachedTasks(cachedUser.uid);
  loadOfflineTasks(cachedUser.uid);
  updateLandingLinks(true);
  updateOnlineState();
  updateWelcomeCopy();
  initTasksPage(cachedUser);
  initDashboardPage();
  initProfilePage(cachedUser);
  return true;
}

async function handleSignedInUser(user) {
  state.user = user;
  cacheSession(user);
  warmOfflineShell();
  updateLandingLinks(true);
  loadOfflineTasks(user.uid);
  loadCachedTasks(user.uid);
  await ensureUserProfile(user);
  updateWelcomeCopy();
  bindTaskStream(user);
  initTasksPage(user);
  initDashboardPage();
  initProfilePage(user);
  syncOfflineTasks(user);
}

function handleSignedOutUser() {
  const previousUserId = state.user?.uid;
  state.user = null;
  state.profile = null;
  state.tasks = [];
  state.offlineTasks = [];
  state.tasksBound = false;
  clearCachedSession();
  clearCachedUserData(previousUserId);
  updateLandingLinks(false);
  updateOnlineState();

  if (protectedPages.has(page)) {
    redirectTo("login.html");
    return;
  }

  initSignupPage();
  initLoginPage();
}

async function attachFirebaseAuth() {
  if (!await loadFirebase()) {
    return false;
  }

  if (state.authObserverBound) {
    return true;
  }

  state.authObserverBound = true;

  onAuthStateChangedRef(auth, async (user) => {
    if (!user) {
      handleSignedOutUser();
      return;
    }

    if (authPages.has(page)) {
      redirectTo("dashboard.html");
      return;
    }

    await handleSignedInUser(user);
  });

  return true;
}

async function bootstrapApp() {
  registerServiceWorker();
  const hasCachedSession = bootCachedSession();

  if (hasCachedSession) {
    warmOfflineShell();
  }

  if (!state.isOnline) {
    if (!hasCachedSession) {
      updateLandingLinks(false);
      initSignupPage();
      initLoginPage();
    }

    return;
  }

  const firebaseAttached = await attachFirebaseAuth();

  if (!firebaseAttached && !hasCachedSession) {
    updateLandingLinks(false);
    initSignupPage();
    initLoginPage();
  }
}

window.addEventListener("online", () => {
  state.isOnline = true;
  updateOnlineState();

  if (!state.firebaseReady) {
    attachFirebaseAuth();
  }

  if (state.user) {
    syncOfflineTasks(state.user);
  }
});

window.addEventListener("offline", () => {
  state.isOnline = false;
  updateOnlineState();
});

updateOnlineState();
bootstrapApp();
