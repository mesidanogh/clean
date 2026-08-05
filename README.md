# クレサガ - 景品お探しナビ

クレーンゲームの景品を、どこのゲームセンターで見かけたかを自分や友達と記録・共有できる個人用アプリです。

- 商品名 / 店舗名で検索できます
- 商品名をタップすると、登録した写真が見られます
- スマホのホーム画面に追加すればアプリのように使えます（PWA）
- 友達にはURLを送るだけで共有できます

## できること・できないこと

各社（バンダイ／セガなど）は商品カタログと店舗一覧は公開していますが、**「どの店に今どの商品があるか」という在庫情報はどこも公開していません**。そのため、このアプリは自分と友達がゲーセンで見かけたときにその場で記録する「みんなで作る目撃情報アプリ」です。商品名を入力すると、参考としてバンダイ・セガの公式サイト検索へのリンクが表示されるので、正式名称や商品画像の確認に使えます。

---

## セットアップ手順（無料・約15分）

### 1. Firebaseプロジェクトを作る

1. [Firebaseコンソール](https://console.firebase.google.com/) にGoogleアカウントでログインし、「プロジェクトを追加」で新規プロジェクトを作成（Googleアナリティクスは無効でOK）
2. 左メニュー「Authentication」→「Sign-in method」→「匿名」を有効化
   - ログイン画面なしで、友達も含めて誰でも書き込みできるようにするための仕組みです
3. 左メニュー「Firestore Database」→「データベースの作成」→ ロケーションは `asia-northeast1`（東京）推奨 → 本番モードで作成
   - 作成後、「ルール」タブを開き、このプロジェクトの `firestore.rules` の中身をそのまま貼り付けて「公開」
4. 左メニュー「Storage」→「始める」→ 同様にロケーション `asia-northeast1` で作成
   - 「Rules」タブを開き、このプロジェクトの `storage.rules` の中身をそのまま貼り付けて「公開」
5. 左メニューの歯車アイコン→「プロジェクトの設定」→ 下の方の「マイアプリ」→ `</>`（ウェブ）を選んでアプリを登録
   - 表示された `firebaseConfig` の値（apiKey, authDomainなど）をコピー

### 2. 設定ファイルを書き換える

このプロジェクトの `firebase-config.js` を開き、コピーした値に書き換えて保存してください。

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

### 3. ローカルで動作確認（任意）

ターミナルでこのフォルダに移動して以下を実行し、表示された `http://localhost:8000` にスマホと同じWi-Fi内のPCブラウザからアクセスして確認できます。

```bash
python3 -m http.server 8000
```

### 4. 無料で公開する（GitHub Pages）

1. [GitHub](https://github.com/) の無料アカウントを作成
2. 右上「+」→「New repository」で新しいリポジトリを作成（Public、README追加なし）
3. このフォルダで以下を実行（`<GitHubのユーザー名>` と `<リポジトリ名>` は自分のものに置き換え）

```bash
git remote add origin https://github.com/<GitHubのユーザー名>/<リポジトリ名>.git
git branch -M main
git push -u origin main
```

4. GitHubのリポジトリページ →「Settings」→「Pages」→ Source を「Deploy from a branch」、Branch を `main` / `/(root)` にして保存
5. 数分待つと `https://<GitHubのユーザー名>.github.io/<リポジトリ名>/` でアプリが公開されます

このURLを友達に送れば、そのままブラウザで使えます。スマホでURLを開き、共有メニューから「ホーム画面に追加」するとアプリのように使えます。

---

## 注意点

- 匿名ログインを使っているため、URLを知っている人は誰でも閲覧・登録・削除ができます。悪用が心配な場合はURLを不特定多数に公開しないでください。
- Firebaseの無料枠（Spark プラン）の範囲内なので、個人・友達数人での利用なら料金は発生しません。クレジットカード登録も不要です。
- 内容やデザインを変更したい場合は `index.html` `style.css` `app.js` を編集し、`git add -A && git commit -m "update" && git push` するだけで公開サイトに反映されます。
