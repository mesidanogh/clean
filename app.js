import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

let authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (user) resolve(user);
  });
});
signInAnonymously(auth).catch((err) => {
  console.error(err);
  showToast("認証に失敗しました。Firebase設定(Authentication)を確認してください。");
});

const els = {
  searchInput: document.getElementById("searchInput"),
  clearSearch: document.getElementById("clearSearch"),
  searchModeBtns: document.querySelectorAll(".searchMode_btn"),
  list: document.getElementById("list"),
  emptyState: document.getElementById("emptyState"),
  resultCount: document.getElementById("resultCount"),
  addBtn: document.getElementById("addBtn"),
  addModal: document.getElementById("addModal"),
  addForm: document.getElementById("addForm"),
  submitBtn: document.getElementById("submitBtn"),
  photoInput: document.querySelector('input[name="photo"]'),
  photoPreview: document.getElementById("photoPreview"),
  productNameInput: document.querySelector('input[name="productName"]'),
  officialLinkWrap: document.getElementById("officialLinkWrap"),
  officialBandaiLink: document.getElementById("officialBandaiLink"),
  officialSegaLink: document.getElementById("officialSegaLink"),
  detailModal: document.getElementById("detailModal"),
  detailPhoto: document.getElementById("detailPhoto"),
  detailProductName: document.getElementById("detailProductName"),
  detailStoreName: document.getElementById("detailStoreName"),
  detailArea: document.getElementById("detailArea"),
  detailCompany: document.getElementById("detailCompany"),
  detailDate: document.getElementById("detailDate"),
  detailReporter: document.getElementById("detailReporter"),
  detailMemo: document.getElementById("detailMemo"),
  deleteBtn: document.getElementById("deleteBtn"),
  shareBtn: document.getElementById("shareBtn"),
  toast: document.getElementById("toast"),
};

let allSightings = [];
let searchMode = "product"; // "product" | "store"
let selectedDetailId = null;

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (els.toast.hidden = true), 2200);
}

// ---------- Firestore realtime subscription ----------
const q = query(collection(db, "sightings"), orderBy("createdAt", "desc"));
onSnapshot(
  q,
  (snap) => {
    allSightings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  },
  (err) => {
    console.error(err);
    showToast("データの取得に失敗しました。Firebase設定を確認してください。");
  }
);

// ---------- Search ----------
els.searchModeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    searchMode = btn.dataset.mode;
    els.searchModeBtns.forEach((b) => {
      b.classList.toggle("is-active", b === btn);
      b.setAttribute("aria-selected", b === btn ? "true" : "false");
    });
    els.searchInput.placeholder =
      searchMode === "product" ? "商品名を入力…" : "店舗名を入力…";
    render();
  });
});

els.searchInput.addEventListener("input", () => {
  els.clearSearch.hidden = els.searchInput.value.length === 0;
  render();
});

els.clearSearch.addEventListener("click", () => {
  els.searchInput.value = "";
  els.clearSearch.hidden = true;
  render();
});

// ---------- Render list ----------
function render() {
  const kw = els.searchInput.value.trim().toLowerCase();
  const filtered = allSightings.filter((s) => {
    if (!kw) return true;
    const field = searchMode === "product" ? s.productName : s.storeName;
    return (field || "").toLowerCase().includes(kw);
  });

  els.resultCount.textContent = kw
    ? `${filtered.length}件ヒット`
    : `全${allSightings.length}件`;

  els.list.innerHTML = "";
  els.emptyState.hidden = filtered.length > 0;

  filtered.forEach((s) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.innerHTML = `
      <div class="card_thumb">${
        s.photoUrl
          ? `<img src="${s.photoUrl}" alt="">`
          : `🎁`
      }</div>
      <div class="card_body">
        <p class="card_name">${escapeHtml(s.productName)}</p>
        <p class="card_store">${escapeHtml(s.storeName)}</p>
        <div class="card_meta">
          ${s.area ? `<span class="badge">${escapeHtml(s.area)}</span>` : ""}
          ${s.company ? `<span class="badge">${escapeHtml(s.company)}</span>` : ""}
          <span>${formatDate(s.createdAt)}</span>
        </div>
      </div>
    `;
    card.addEventListener("click", () => openDetail(s));
    els.list.appendChild(card);
  });
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function formatDate(ts) {
  if (!ts || !ts.toDate) return "";
  const d = ts.toDate();
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------- Add modal ----------
els.addBtn.addEventListener("click", () => {
  els.addForm.reset();
  els.photoPreview.hidden = true;
  els.officialLinkWrap.hidden = true;
  els.addModal.showModal();
});

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.closest("dialog").close();
  });
});

els.productNameInput.addEventListener("input", () => {
  const name = els.productNameInput.value.trim();
  if (!name) {
    els.officialLinkWrap.hidden = true;
    return;
  }
  els.officialLinkWrap.hidden = false;
  els.officialBandaiLink.href = `https://bsp-prize.jp/search/?kw=${encodeURIComponent(name)}`;
  els.officialSegaLink.href = `https://segaplaza.jp/search/?q=${encodeURIComponent(name)}&type=prize`;
});

els.photoInput.addEventListener("change", () => {
  const file = els.photoInput.files[0];
  if (!file) {
    els.photoPreview.hidden = true;
    return;
  }
  const url = URL.createObjectURL(file);
  els.photoPreview.src = url;
  els.photoPreview.hidden = false;
});

els.addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.submitBtn.disabled = true;
  els.submitBtn.textContent = "登録中…";

  try {
    await authReady;
    const fd = new FormData(els.addForm);
    const productName = fd.get("productName").trim();
    const storeName = fd.get("storeName").trim();
    const area = fd.get("area").trim();
    const company = fd.get("company");
    const memo = fd.get("memo").trim();
    const reporterName = fd.get("reporterName").trim();
    const photoFile = fd.get("photo");

    let photoUrl = "";
    if (photoFile && photoFile.size > 0) {
      const path = `sightings/${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, photoFile);
      photoUrl = await getDownloadURL(storageRef);
    }

    await addDoc(collection(db, "sightings"), {
      productName,
      storeName,
      area,
      company,
      memo,
      reporterName,
      photoUrl,
      createdAt: serverTimestamp(),
    });

    els.addModal.close();
    showToast("登録しました！");
  } catch (err) {
    console.error(err);
    showToast("登録に失敗しました。Firebase設定を確認してください。");
  } finally {
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = "登録する";
  }
});

// ---------- Detail modal ----------
function openDetail(s) {
  selectedDetailId = s.id;
  if (s.photoUrl) {
    els.detailPhoto.src = s.photoUrl;
    els.detailPhoto.hidden = false;
  } else {
    els.detailPhoto.hidden = true;
  }
  els.detailProductName.textContent = s.productName;
  els.detailStoreName.textContent = s.storeName;
  els.detailArea.textContent = s.area || "―";
  els.detailCompany.textContent = s.company || "―";
  els.detailDate.textContent = formatFullDate(s.createdAt);
  els.detailReporter.textContent = s.reporterName || "―";
  els.detailMemo.textContent = s.memo || "―";
  els.detailModal.showModal();
}

function formatFullDate(ts) {
  if (!ts || !ts.toDate) return "―";
  const d = ts.toDate();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

els.deleteBtn.addEventListener("click", async () => {
  if (!selectedDetailId) return;
  if (!confirm("この記録を削除しますか？")) return;
  try {
    await authReady;
    const target = allSightings.find((s) => s.id === selectedDetailId);
    await deleteDoc(doc(db, "sightings", selectedDetailId));
    if (target && target.photoUrl) {
      try {
        const path = decodeURIComponent(
          new URL(target.photoUrl).pathname.split("/o/")[1].split("?")[0]
        );
        await deleteObject(ref(storage, path));
      } catch (e) {
        // photo cleanup best-effort
      }
    }
    els.detailModal.close();
    showToast("削除しました");
  } catch (err) {
    console.error(err);
    showToast("削除に失敗しました");
  }
});

// ---------- Share ----------
els.shareBtn.addEventListener("click", async () => {
  const shareData = {
    title: "クレサガ - 景品お探しナビ",
    text: "クレーンゲームの景品がどこにあるか記録・検索できるアプリだよ！",
    url: location.href,
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (e) {
      /* user cancelled */
    }
  } else {
    await navigator.clipboard.writeText(location.href);
    showToast("URLをコピーしました！");
  }
});

// ---------- PWA service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
