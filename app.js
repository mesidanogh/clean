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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
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
  detailOfficialLink: document.getElementById("detailOfficialLink"),
  deleteBtn: document.getElementById("deleteBtn"),
  storesModal: document.getElementById("storesModal"),
  storesModalPhoto: document.getElementById("storesModalPhoto"),
  storesModalProductName: document.getElementById("storesModalProductName"),
  storesModalList: document.getElementById("storesModalList"),
  productsModal: document.getElementById("productsModal"),
  productsModalStoreName: document.getElementById("productsModalStoreName"),
  productsModalList: document.getElementById("productsModalList"),
  shareBtn: document.getElementById("shareBtn"),
  toast: document.getElementById("toast"),
  dataInfo: document.getElementById("dataInfo"),
};

let manualSightings = [];
let autoRecords = [];
let allRecords = [];
let searchMode = "product"; // "product" | "store"
let selectedDetail = null;
let compressedPhotoDataUrl = "";

// ---------- 自動取得データ(公式に店舗×商品対応を公開している企業)の読み込み ----------
// data/prizes.json は { companies, products, stores, placements } の形式。
// 同じ商品が多数の店舗に置かれているため、商品マスタ/店舗マスタを分離し
// placements([商品index, 店舗index])だけで対応関係を持たせてファイルを軽量化している。
fetch("./data/prizes.json")
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error("not found"))))
  .then((data) => {
    const products = data.products || [];
    const stores = data.stores || [];
    const companies = data.companies || {};
    autoRecords = (data.placements || []).map(([productIdx, storeIdx]) => {
      const p = products[productIdx];
      const store = stores[storeIdx];
      return {
        id: `auto-${store.id}-${p.id}`,
        source: "auto",
        productName: p.name,
        storeName: store.name,
        storeUrl: store.url,
        area: "",
        company: companies[p.company] || p.company,
        memo: p.date,
        photoUrl: p.image,
        reporterName: "公式データ(自動取得)",
      };
    });
    const companyNames = Object.values(companies).join("・");
    els.dataInfo.textContent = data.updatedAt
      ? `${companyNames} 計${stores.length}店舗のデータを${data.updatedAt.slice(0, 10)}に自動取得（毎日更新）`
      : "";
    mergeAndRender();
  })
  .catch((err) => {
    console.warn("自動取得データを読み込めませんでした", err);
  });

// 写真はFirebase Storage(有料プラン必須)を使わず、縮小してFirestoreに直接保存する。
function compressImage(file, maxDim = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else if (height >= width && height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(objectUrl);
      reject(e);
    };
    img.src = objectUrl;
  });
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (els.toast.hidden = true), 2200);
}

// ---------- Firestore realtime subscription (namco以外の手動報告) ----------
const q = query(collection(db, "sightings"), orderBy("createdAt", "desc"));
onSnapshot(
  q,
  (snap) => {
    manualSightings = snap.docs.map((d) => ({ id: d.id, source: "manual", ...d.data() }));
    mergeAndRender();
  },
  (err) => {
    console.error(err);
    showToast("データの取得に失敗しました。Firebase設定を確認してください。");
  }
);

function mergeAndRender() {
  allRecords = [...autoRecords, ...manualSightings];
  render();
}

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
// 商品名検索モードでは同じ商品が複数店舗に置かれていても1枚のカードにまとめ、
// タップすると店舗一覧(storesModal)を開く。店舗名検索モードではその逆に、
// 同じ店舗の商品をまとめて1枚のカードにし、タップすると取扱商品一覧
// (productsModal)を開く。
function groupByProduct(records) {
  const groups = [];
  const indexByName = new Map();
  records.forEach((s) => {
    const key = (s.productName || "").trim();
    let group = indexByName.get(key);
    if (!group) {
      group = { productName: s.productName, photoUrl: "", records: [] };
      indexByName.set(key, group);
      groups.push(group);
    }
    if (!group.photoUrl && s.photoUrl) group.photoUrl = s.photoUrl;
    group.records.push(s);
  });
  return groups;
}

function groupByStore(records) {
  const groups = [];
  const indexByName = new Map();
  records.forEach((s) => {
    const key = (s.storeName || "").trim();
    let group = indexByName.get(key);
    if (!group) {
      group = { storeName: s.storeName, records: [] };
      indexByName.set(key, group);
      groups.push(group);
    }
    group.records.push(s);
  });
  return groups;
}

function render() {
  const kw = els.searchInput.value.trim().toLowerCase();
  const filtered = allRecords.filter((s) => {
    if (!kw) return true;
    const field = searchMode === "product" ? s.productName : s.storeName;
    return (field || "").toLowerCase().includes(kw);
  });

  const groups = searchMode === "product" ? groupByProduct(filtered) : groupByStore(filtered);

  els.resultCount.textContent = kw
    ? `${groups.length}件ヒット`
    : `全${groups.length}件`;

  els.list.innerHTML = "";
  els.emptyState.hidden = groups.length > 0;

  if (searchMode === "product") {
    groups.forEach((group) => renderProductCard(group));
  } else {
    groups.forEach((group) => renderStoreCard(group));
  }
}

function renderProductCard(group) {
  const first = group.records[0];
  const multi = group.records.length > 1;
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.innerHTML = `
    <div class="card_thumb">${
      group.photoUrl
        ? `<img src="${group.photoUrl}" alt="" onerror="this.remove()">`
        : `🎁`
    }</div>
    <div class="card_body">
      <p class="card_name">${escapeHtml(group.productName)}</p>
      <p class="card_store">${multi ? `${group.records.length}店舗で見つかっています` : escapeHtml(first.storeName)}</p>
      <div class="card_meta">
        ${multi ? "" : renderCardMeta(first)}
      </div>
    </div>
  `;
  card.addEventListener("click", () => {
    if (multi) {
      openStoresList(group);
    } else {
      openDetail(first);
    }
  });
  els.list.appendChild(card);
}

function renderCardMeta(s) {
  const dateLabel = s.source === "auto" ? escapeHtml(s.memo || "") : formatDate(s.createdAt);
  return `
    ${s.source === "auto" ? `<span class="badge badge-auto">${escapeHtml(s.company)}公式</span>` : ""}
    ${s.area ? `<span class="badge">${escapeHtml(s.area)}</span>` : ""}
    ${s.company && s.source !== "auto" ? `<span class="badge">${escapeHtml(s.company)}</span>` : ""}
    <span>${dateLabel}</span>
  `;
}

function renderStoreCard(group) {
  const first = group.records[0];
  const multi = group.records.length > 1;
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.innerHTML = `
    <div class="card_thumb">🏬</div>
    <div class="card_body">
      <p class="card_name">${escapeHtml(group.storeName)}</p>
      <p class="card_store">${multi ? `${group.records.length}件の商品があります` : escapeHtml(first.productName)}</p>
      <div class="card_meta">
        ${multi ? "" : renderCardMeta(first)}
      </div>
    </div>
  `;
  card.addEventListener("click", () => {
    if (multi) {
      openProductsList(group);
    } else {
      openDetail(first);
    }
  });
  els.list.appendChild(card);
}

// 同じ商品が見つかった店舗の一覧を表示する。
function openStoresList(group) {
  if (group.photoUrl) {
    els.storesModalPhoto.src = group.photoUrl;
    els.storesModalPhoto.hidden = false;
  } else {
    els.storesModalPhoto.hidden = true;
  }
  els.storesModalProductName.textContent = group.productName;

  els.storesModalList.innerHTML = "";
  group.records.forEach((s) => {
    const li = document.createElement("li");
    const row = document.createElement("button");
    row.type = "button";
    row.className = "storeRow";
    row.innerHTML = `
      <div class="storeRow_body">
        <p class="storeRow_name">${escapeHtml(s.storeName)}</p>
        <div class="storeRow_meta">${renderCardMeta(s)}</div>
      </div>
      <span class="storeRow_arrow">›</span>
    `;
    row.addEventListener("click", () => {
      els.storesModal.close();
      openDetail(s);
    });
    li.appendChild(row);
    els.storesModalList.appendChild(li);
  });

  els.storesModal.showModal();
}

// その店舗にある商品の一覧を表示する。
function openProductsList(group) {
  els.productsModalStoreName.textContent = group.storeName;

  els.productsModalList.innerHTML = "";
  group.records.forEach((s) => {
    const li = document.createElement("li");
    const row = document.createElement("button");
    row.type = "button";
    row.className = "storeRow";
    row.innerHTML = `
      <div class="storeRow_body">
        <p class="storeRow_name">${escapeHtml(s.productName)}</p>
        <div class="storeRow_meta">${renderCardMeta(s)}</div>
      </div>
      <span class="storeRow_arrow">›</span>
    `;
    row.addEventListener("click", () => {
      els.productsModal.close();
      openDetail(s);
    });
    li.appendChild(row);
    els.productsModalList.appendChild(li);
  });

  els.productsModal.showModal();
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
  compressedPhotoDataUrl = "";
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

els.photoInput.addEventListener("change", async () => {
  const file = els.photoInput.files[0];
  if (!file) {
    els.photoPreview.hidden = true;
    compressedPhotoDataUrl = "";
    return;
  }
  try {
    compressedPhotoDataUrl = await compressImage(file);
    els.photoPreview.src = compressedPhotoDataUrl;
    els.photoPreview.hidden = false;
  } catch (err) {
    console.error(err);
    compressedPhotoDataUrl = "";
    els.photoPreview.hidden = true;
    showToast("写真の読み込みに失敗しました");
  }
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
    const photoUrl = compressedPhotoDataUrl;

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
  selectedDetail = s;
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
  els.detailReporter.textContent = s.reporterName || "―";
  els.detailMemo.textContent = s.memo || "―";

  if (s.source === "auto") {
    els.detailDate.textContent = s.memo || "―";
    els.detailOfficialLink.href = s.storeUrl;
    els.detailOfficialLink.hidden = false;
    els.deleteBtn.hidden = true;
  } else {
    els.detailDate.textContent = formatFullDate(s.createdAt);
    els.detailOfficialLink.hidden = true;
    els.deleteBtn.hidden = false;
  }

  els.detailModal.showModal();
}

function formatFullDate(ts) {
  if (!ts || !ts.toDate) return "―";
  const d = ts.toDate();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

els.deleteBtn.addEventListener("click", async () => {
  if (!selectedDetail || selectedDetail.source !== "manual") return;
  if (!confirm("この記録を削除しますか？")) return;
  try {
    await authReady;
    await deleteDoc(doc(db, "sightings", selectedDetail.id));
    els.detailModal.close();
    showToast("削除しました");
  } catch (err) {
    console.error(err);
    showToast("削除に失敗しました");
  }
});

// ---------- Share (QRコード) ----------
const shareModal = document.getElementById("shareModal");
const qrcodeContainer = document.getElementById("qrcodeContainer");
const shareUrlText = document.getElementById("shareUrlText");
const copyUrlBtn = document.getElementById("copyUrlBtn");
const nativeShareBtn = document.getElementById("nativeShareBtn");
let qrRendered = false;

els.shareBtn.addEventListener("click", () => {
  shareUrlText.textContent = location.href;
  if (!qrRendered && window.QRCode) {
    new QRCode(qrcodeContainer, {
      text: location.href,
      width: 180,
      height: 180,
      colorDark: "#2b2013",
      colorLight: "#ffffff",
    });
    qrRendered = true;
  }
  nativeShareBtn.hidden = !navigator.share;
  shareModal.showModal();
});

copyUrlBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(location.href);
  showToast("URLをコピーしました！");
});

nativeShareBtn.addEventListener("click", async () => {
  const shareData = {
    title: "CLESON - 景品お探しナビ",
    text: "クレーンゲームの景品がどこにあるか記録・検索できるアプリだよ！",
    url: location.href,
  };
  try {
    await navigator.share(shareData);
  } catch (e) {
    /* user cancelled */
  }
});

// ---------- PWA service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
