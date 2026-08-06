"""
公式サイトが店舗×商品の対応を公開している2社を巡回し、data/prizes.json に書き出す。

- namco (バンダイナムコアミューズメント直営店): bandainamco-am.co.jp の店舗ごとの
  「入荷プライズ」ページ(HTML)をスクレイピング。
- タイトー: taito.co.jp が裏で使っている公開JSON API
  (/api/Prize/ で商品一覧、/api/PrizeStoreHandling/ で商品ごとの取扱店舗一覧)を利用。

GiGO(旧セガ運営)など、店舗×商品の対応を公開していないチェーンは対象外。

標準ライブラリのみで動作するため、ローカルでもGitHub Actions上でも追加インストール不要で実行できる。
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "prizes.json"
REQUEST_INTERVAL_SEC = 0.4
TIMEOUT_SEC = 15
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; kuresaga-personal-app/1.0)"}

COMPANIES = {
    "namco": "バンダイナムコ(namco)",
    "taito": "タイトー",
}


def fetch(url: str, retries: int = 2) -> str:
    # socket.timeoutはPython 3.9ではTimeoutErrorのサブクラスではないため、
    # 両対応できる共通の親クラスOSErrorで捕捉する(3.10+ではsocket.timeout=TimeoutError)。
    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as res:
                return res.read().decode("utf-8", errors="replace")
        except OSError as e:
            last_err = e
            if attempt < retries:
                time.sleep(1.5)
    raise last_err


def fetch_json(url: str):
    return json.loads(fetch(url))


# ---------------------------------------------------------------------------
# namco (バンダイナムコアミューズメント直営店)
# ---------------------------------------------------------------------------

NAMCO_SITEMAP_URL = "https://bandainamco-am.co.jp/sitemap_game_center.xml"
NAMCO_STORE_URL_TMPL = "https://bandainamco-am.co.jp/game_center/loc/{slug}/?p=prize_info"
NAMCO_STORE_SLUG_RE = re.compile(
    r"<loc>https://bandainamco-am\.co\.jp/game_center/loc/([a-zA-Z0-9_-]+)/</loc>"
)
NAMCO_TITLE_RE = re.compile(r"<title>入荷プライズ \| (.*?) \|")
NAMCO_ITEM_RE = re.compile(
    r'href="/game_center/prize/detail\.html\?prize=(?P<id>[^"]+)">'
    r"<dl><dt>(?P<name>.*?)</dt>"
    r'<dd class="wm-column-item_p"><img src="(?P<img>[^"]+)"[^>]*>\s*</dd>'
    r'<dd class="wm-column-item_a"><span>(?P<date>.*?)</span>',
    re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")


def strip_tags(text: str) -> str:
    return TAG_RE.sub("", text).strip()


def namco_get_store_slugs() -> list[str]:
    xml_text = fetch(NAMCO_SITEMAP_URL)
    slugs = NAMCO_STORE_SLUG_RE.findall(xml_text)
    return sorted(set(slugs))


def namco_scrape_store(slug: str) -> dict | None:
    url = NAMCO_STORE_URL_TMPL.format(slug=slug)
    try:
        html = fetch(url)
    except (urllib.error.URLError, OSError) as e:
        print(f"  [skip] {slug}: {e}", file=sys.stderr)
        return None

    title_match = NAMCO_TITLE_RE.search(html)
    store_name = title_match.group(1).strip() if title_match else slug

    items = []
    for m in NAMCO_ITEM_RE.finditer(html):
        name = strip_tags(m.group("name"))
        date = strip_tags(m.group("date"))
        img = m.group("img")
        if img.startswith("/"):
            img = "https://bandainamco-am.co.jp" + img
        if "now-printing" in img:
            img = ""
        items.append({"prizeId": m.group("id"), "productName": name, "imageUrl": img, "appearDate": date})

    return {
        "storeId": slug,
        "storeName": store_name,
        "storeUrl": f"https://bandainamco-am.co.jp/game_center/loc/{slug}/",
        "prizes": items,
    }


def scrape_namco(products, product_index, stores, store_index, placements):
    print("[namco] 店舗一覧を取得中...")
    slugs = namco_get_store_slugs()
    print(f"[namco] {len(slugs)}店舗見つかりました")

    for i, slug in enumerate(slugs, 1):
        result = namco_scrape_store(slug)
        count = len(result["prizes"]) if result else 0
        print(f"  [namco {i}/{len(slugs)}] {slug}: {count}件")
        if not result or not result["prizes"]:
            time.sleep(REQUEST_INTERVAL_SEC)
            continue

        store_key = f"namco:{result['storeId']}"
        if store_key not in store_index:
            store_index[store_key] = len(stores)
            stores.append(
                {"id": store_key, "name": result["storeName"], "url": result["storeUrl"], "company": "namco"}
            )
        store_idx = store_index[store_key]

        for item in result["prizes"]:
            product_key = f"namco:{item['prizeId']}"
            if product_key not in product_index:
                product_index[product_key] = len(products)
                products.append(
                    {
                        "id": product_key,
                        "name": item["productName"],
                        "image": item["imageUrl"],
                        "date": item["appearDate"],
                        "company": "namco",
                    }
                )
            placements.append([product_index[product_key], store_idx])

        time.sleep(REQUEST_INTERVAL_SEC)


# ---------------------------------------------------------------------------
# タイトー (taito.co.jp 公開JSON API)
# ---------------------------------------------------------------------------

TAITO_CATALOG_URL = "https://www.taito.co.jp/api/Prize/?keyword=&storeID=&offset=0&limit=10000&sortName=&isDesc=false"
TAITO_STORE_HANDLING_URL_TMPL = "https://www.taito.co.jp/api/PrizeStoreHandling/?productID={pid}&lang=ja"
TAITO_STORE_SEARCH_URL = "https://www.taito.co.jp/store"


def taito_fetch_catalog() -> list[dict]:
    return fetch_json(TAITO_CATALOG_URL)


def taito_fetch_store_handling(product_id: str) -> list[dict]:
    try:
        data = fetch_json(TAITO_STORE_HANDLING_URL_TMPL.format(pid=urllib.parse.quote(product_id)))
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
        print(f"  [skip] {product_id}: {e}", file=sys.stderr)
        return []
    return data.get("StoreDatas") or []


def taito_image_url(image_path: str, image_name: str) -> str:
    if not image_name:
        return ""
    return f"https://www.taito.co.jp/Image/500/?url=https://{image_path}{image_name}"


def scrape_taito(products, product_index, stores, store_index, placements):
    print("[taito] 商品一覧を取得中...")
    catalog = taito_fetch_catalog()
    print(f"[taito] {len(catalog)}商品見つかりました")

    for i, item in enumerate(catalog, 1):
        base = item.get("BaseShoppingProductData", {})
        product_id = base.get("ProductID") or item.get("ProductID")
        if not product_id:
            continue
        product_key = f"taito:{product_id}"
        product_name = item.get("ProductName") or ""

        store_rows = taito_fetch_store_handling(product_id)
        print(f"  [taito {i}/{len(catalog)}] {product_name}: {len(store_rows)}店舗")

        if store_rows and product_key not in product_index:
            image = taito_image_url(base.get("ImagePath", ""), base.get("ImageName01", ""))
            date = store_rows[0].get("ArrivalDatePrizeField") or store_rows[0].get("DesignationDate") or ""
            product_index[product_key] = len(products)
            products.append(
                {"id": product_key, "name": product_name, "image": image, "date": date, "company": "taito"}
            )

        for row in store_rows:
            store_id = row.get("StoreID")
            if not store_id:
                continue
            store_key = f"taito:{store_id}"
            if store_key not in store_index:
                store_index[store_key] = len(stores)
                stores.append(
                    {
                        "id": store_key,
                        "name": row.get("StoreName") or store_id,
                        "url": TAITO_STORE_SEARCH_URL,
                        "company": "taito",
                    }
                )
            placements.append([product_index[product_key], store_index[store_key]])

        time.sleep(REQUEST_INTERVAL_SEC)


# ---------------------------------------------------------------------------

def main():
    products: list[dict] = []
    product_index: dict[str, int] = {}
    stores: list[dict] = []
    store_index: dict[str, int] = {}
    placements: list[list[int]] = []

    for scraper in (scrape_namco, scrape_taito):
        try:
            scraper(products, product_index, stores, store_index, placements)
        except Exception as e:
            print(f"[error] {scraper.__name__} が失敗しました: {e}", file=sys.stderr)

    output = {
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S+09:00", time.localtime()),
        "companies": COMPANIES,
        "products": products,
        "stores": stores,
        "placements": placements,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"完了: 店舗{len(stores)} / 商品{len(products)}種類 / 設置{len(placements)}件 "
        f"を {OUTPUT_PATH} に保存しました"
    )


if __name__ == "__main__":
    main()
