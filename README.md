# Rikunabi Plus

リクナビの求人検索ページをより便利にするユーザースクリプトです。

現在は、求人検索結果ページに詳細ページから取得した給与情報を表示します。今後、就活中の情報収集や比較を効率化するための機能を追加していく予定です。

## 主な機能

- 求人検索結果ページに給与情報を表示
- 詳細ページの「給与」「初任給」「賃金」「月給」などの項目を自動取得
- 最低月給を指定して検索結果を絞り込み
- 検索結果の求人カードを「表示しない」ボタンで隠す
- 「表示しない求人」から隠した求人をもう一度表示
- 取得できない場合は検索結果ページを汚さないように非表示
- リクナビ内の複数の検索ページに対応

## 使い方

### スクリプトをインストール / Install script

[RikunabiPlus.user.js をインストール](https://raw.githubusercontent.com/yonagatsuki/Rikunabi-Plus/main/RikunabiPlus.user.js)

1. ブラウザに Tampermonkey をインストールします。
   - [Chrome 版 Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Firefox 版 Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/)

2. 上のインストールリンクを開きます。

3. Tampermonkey のインストール画面が表示されたら、「インストール」をクリックします。


## 最低月給フィルター

画面右下の「最低月給」に金額を万円単位で入力すると、その金額以上の求人だけを表示できます。





