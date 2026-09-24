# Bookmarklet Context Menu

Chromeの右クリックメニューからBookmarkletを実行し、管理画面から登録・編集・並べ替え・検索・JSON入出力・Chromeブックマーク同期を行うManifest V3拡張機能です。

## v0.4.1

- 複数のChromeブックマークフォルダを同期ルートとして指定
- 各同期ルート配下を再帰的に双方向同期
- Bookmarklet/フォルダの移動を検知し、同期範囲への出入りを自動反映
- 新規BookmarkletのChrome保存先を同期範囲内から指定
- Chrome Bookmark IDを同期済み項目の同一性キーとして利用
- 起動時・インポート終了時・手動操作時の全体整合 `syncAll()`
- Chrome側の作成・変更・移動・削除イベントを監視
- v0.3.xの `bookmarkId` を `chromeBookmarkId` へ移行するschema v4 migration
- v0.3.xで同期済みだったBookmarkletの親フォルダを初期同期ルートとして移行
- 同期ルート消失、保存先消失、親子ルート重複を同期時に自己修復
- Chrome起点の競合ではChrome側を正とする
- JSONインポート項目はローカル専用として維持

## インストール

1. `chrome://extensions` を開く。
2. 「デベロッパー モード」をONにする。
3. 「パッケージ化されていない拡張機能を読み込む」でこのリポジトリのフォルダを指定する。
4. Chrome 138以降では拡張機能の「詳細」で「ユーザー スクリプトを許可する」をONにする。
5. 拡張機能アイコンをクリックして管理画面を開く。

## 同期仕様

同期対象は、管理画面で指定した1つ以上の同期ルートとその全子孫です。その範囲内にある `javascript:` URLのみを同期します。

- Chromeで作成: 同期範囲内なら拡張機能へ追加
- Chromeでタイトル/URL変更: 拡張機能へ反映
- 通常URL → `javascript:`: 同期範囲内なら追加
- `javascript:` → 通常URL: 拡張機能から同期項目を解除
- 同期範囲外 → 内へ移動: 追加
- 同期範囲内 → 外へ移動: 拡張機能から解除（Chrome側は削除しない）
- フォルダ移動: 配下全体を再評価
- Chromeで削除: 拡張機能から削除
- 拡張機能で同期済み項目を編集: Chromeを更新後に再同期
- 拡張機能で同期済み項目を削除: 確認後、Chrome側も削除
- 起動時に不一致: Chrome側を正として収束

## データ

`chrome.storage.local` に主に以下を保存します。

- `schemaVersion`: `4`
- `bookmarklets`: Bookmarklet一覧。同期済みは `chromeBookmarkId` を保持
- `syncSettings`: `enabled`, `rootFolderIds`, `defaultSaveFolderId`, `lastSyncAt`, `lastSyncCount`

## 制約

- Chrome標準のブックマークバー/ブックマークマネージャーの右クリックメニューへ拡張機能独自項目を追加することはできません。
- `chrome://` やChrome Web Storeなど、Chromeがスクリプト注入を禁止するページではBookmarkletを実行できません。
- v0.4.1ではChromeフォルダ階層を右クリックメニュー階層へ反映しません。


## v0.4.1

Chromeブックマーク一覧から、同期対象外のBookmarkletを手動で拡張機能へ追加する機能を復元しました。手動追加はChrome側を変更せずローカルコピーとして保持し、後から元フォルダが同期対象になった場合は同じChrome Bookmark IDを基に同期項目へ昇格して重複を防ぎます。
