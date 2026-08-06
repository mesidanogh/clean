"""
namcoブランドの各店舗（バンダイナムコアミューズメント運営）の「入荷プライズ」ページを巡回し、
店舗ごとに現在登場している景品(商品名・画像・登場日)を集めて data/prizes.json に書き出す。

公式に店舗×商品の対応が載っている唯一の情報源が bandainamco-am.co.jp のため、
現状カバーできるのは namco ブランド店舗のみ（GiGO/タイトーステーション等は同様のページが無いため非対応）。

標準ライブラリのみで動作するため、ローカルでもGitHub Actions上でも追加インストール不要で実行できる。
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

SITEMAP_URL = "https://bandainamco-am.co.jp/sitemap_game_center.xml"
STORE_URL_TMPL = "https://bandainamco-am.co.jp/game_center/loc/{slug}/?p=prize_info"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "prizes.json"
REQUEST_INTERVAL_SEC = 0.4
TIMEOUT_SEC = 15
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; kuresaga-personal-app/1.0)"}

STORE_SLUG_RE = re.compile(
    r"<loc>https://bandainamco-am\.co\.jp/game_center/loc/([a-zA-Z0-9_-]+)/</loc>"
)
TITLE_RE = re.compile(r"<title>入荷プライズ \| (.*?) \|")
ITEM_RE = re.compile(
    r'href="/game_center/prize/detail\.html\?prize=(?P<id>[^"]+)">'
    r"<dl><dt>(?P<name>.*?)</dt>"
    r'<dd class="wm-column-item_p"><img src="(?P<img>[^"]+)"[^>]*>\s*</dd>'
    r'<dd class="wm-column-item_a"><span>(?P<date>.*?)</span>',
    re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as res:
        return res.read().decode("utf-8", errors="replace")


def get_store_slugs() -> list[str]:
    xml_text = fetch(SITEMAP_URL)
    slugs = STORE_SLUG_RE.findall(xml_text)
    return sorted(set(slugs))


def strip_tags(text: str) -> str:
    return TAG_RE.sub("", text).strip()


def scrape_store(slug: str) -> dict | None:
    url = STORE_URL_TMPL.format(slug=slug)
    try:
        html = fetch(url)
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"  [skip] {slug}: {e}", file=sys.stderr)
        return None

    title_match = TITLE_RE.search(html)
    store_name = title_match.group(1).strip() if title_match else slug

    items = []
    for m in ITEM_RE.finditer(html):
        name = strip_tags(m.group("name"))
        date = strip_tags(m.group("date"))
        img = m.group("img")
        if img.startswith("/"):
            img = "https://bandainamco-am.co.jp" + img
        if "now-printing" in img:
            img = ""
        items.append(
            {
                "prizeId": m.group("id"),
                "productName": name,
                "imageUrl": img,
                "appearDate": date,
            }
        )

    return {
        "storeSlug": slug,
        "storeName": store_name,
        "storeUrl": f"https://bandainamco-am.co.jp/game_center/loc/{slug}/",
        "prizes": items,
    }


def main():
    print("店舗一覧を取得中...")
    slugs = get_store_slugs()
    print(f"{len(slugs)}店舗見つかりました")

    raw_stores = []
    for i, slug in enumerate(slugs, 1):
        result = scrape_store(slug)
        if result and result["prizes"]:
            raw_stores.append(result)
        print(f"  [{i}/{len(slugs)}] {slug}: {len(result['prizes']) if result else 0}件")
        time.sleep(REQUEST_INTERVAL_SEC)

    # 同じ商品が多数の店舗で重複するため、商品マスタと店舗マスタを分離し、
    # 「どの商品indexがどの店舗indexにあるか」のペアだけを持つ軽量な形式にする。
    products: list[dict] = []
    product_index: dict[str, int] = {}
    stores: list[dict] = []
    placements: list[list[int]] = []

    for raw_store in raw_stores:
        store_idx = len(stores)
        stores.append(
            {
                "slug": raw_store["storeSlug"],
                "name": raw_store["storeName"],
                "url": raw_store["storeUrl"],
            }
        )
        for item in raw_store["prizes"]:
            pid = item["prizeId"]
            if pid not in product_index:
                product_index[pid] = len(products)
                products.append(
                    {
                        "id": pid,
                        "name": item["productName"],
                        "image": item["imageUrl"],
                        "date": item["appearDate"],
                    }
                )
            placements.append([product_index[pid], store_idx])

    output = {
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S+09:00", time.localtime()),
        "source": "bandainamco-am.co.jp (namcoブランド店舗のみ)",
        "products": products,
        "stores": stores,
        "placements": placements,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(
        f"完了: 店舗{len(stores)} / 商品{len(products)}種類 / 設置{len(placements)}件 "
        f"を {OUTPUT_PATH} に保存しました"
    )


if __name__ == "__main__":
    main()
