// 画像挿入処理で使う純粋なヘルパー関数群。
// GAS の API には依存せず、入力から出力を決めるだけなので単体テストしやすい。
// （GAS では各 .js ファイルがグローバルスコープを共有するため、コード.js から
//  そのまま呼び出せる。module.exports は使わない。）

// Data URL（"data:<mime>;base64,xxxx"）から Base64 本体部分だけを取り出す
function extractBase64Data(dataUrl) {
  return dataUrl.split(',')[1];
}

// ファイル名から拡張子を除いた基底名を返す（拡張子が無ければ元の名前のまま）
function getImageBaseName(fileName) {
  return fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
}

// Google Docs が標準対応する MIME タイプかどうかを判定する
function isDocsSupportedImageType(mimeType, supportedMimeTypes) {
  return supportedMimeTypes.includes(mimeType);
}

// カーソルが属する要素から、本文（BODY_SECTION）直下の要素まで親を遡る。
// インライン位置ではなく本文の子要素を基準に挿入するために使う。
function findTopLevelElement(element, bodySectionType) {
  let current = element;
  while (current.getParent() && current.getParent().getType() !== bodySectionType) {
    current = current.getParent();
  }
  return current;
}
