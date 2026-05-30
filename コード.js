// アドオンが初回インストールされたときに実行される必須処理
function onInstall(e) {
  onOpen(e);
}

// ドキュメントが開かれたときに「拡張機能」の中にメニューを追加する
function onOpen(e) {
  DocumentApp.getUi()
    .createAddonMenu() // ★ createMenu から createAddonMenu に変更
    .addItem('画像を一括挿入', 'showImagePickerDialog')
    .addToUi();
}

// ファイル選択ダイアログを表示する
function showImagePickerDialog() {
  const htmlOutput = HtmlService.createHtmlOutputFromFile('Dialog')
    .setWidth(450)
    .setHeight(300)
    .setTitle('挿入する画像ファイルの選択');
  DocumentApp.getUi().showModalDialog(htmlOutput, '画像の選択');
}

// HTMLダイアログからデータを受け取り、ドキュメントに挿入するメイン処理
function insertSelectedImages(filesData) {
  const doc = DocumentApp.getActiveDocument();
  const cursor = doc.getCursor();

  if (!cursor) {
    throw new Error('ドキュメント内にカーソルが見つかりません。挿入したい位置をクリックしてカーソルを点滅させてから再実行してください。');
  }

  // カーソルが属する本文直下の要素（段落など）を特定し、その直後から挿入していく。
  // インラインで同一位置に挿し込むと、改行による段落分割でカーソルが陳腐化し、
  // 複数画像の並び順が崩れるため、本文の子要素として明示的にブロック挿入する。
  const body = doc.getBody();
  let topLevelElement = cursor.getElement();
  while (
    topLevelElement.getParent() &&
    topLevelElement.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION
  ) {
    topLevelElement = topLevelElement.getParent();
  }
  let insertIndex = body.getChildIndex(topLevelElement) + 1;

  // Google Docsが標準でサポートする主要なMIMEタイプ
  // （BMP/TIFF/HEIC などはダイアログ側でPNGに変換済みのため、ここに到達するのは原則この3種）
  const supportedMimeTypes = [MimeType.PNG, MimeType.JPEG, MimeType.GIF];
  let insertCount = 0;
  let lastCaptionParagraph = null;

  // 受け取ったファイル配列をループ処理
  for (let i = 0; i < filesData.length; i++) {
    const file = filesData[i];

    // Base64データをデコードしてBlobオブジェクトを作成
    let contentType = file.type;
    const base64Data = file.data.split(',')[1];
    const decodedData = Utilities.base64Decode(base64Data);
    let blob = Utilities.newBlob(decodedData, contentType, file.name);

    // 万一Docs非対応形式が届いた場合は、Apps Scriptが変換可能なBMP等のみPNGへ変換を試みる
    if (!supportedMimeTypes.includes(contentType)) {
      try {
        blob = blob.getAs(MimeType.PNG);
        contentType = MimeType.PNG;
      } catch (e) {
        throw new Error('「' + file.name + '」はサポートされていない画像形式です。PNG・JPEG・GIF のいずれかに変換してから挿入してください。');
      }
    }

    // 元のファイル名から拡張子を除いた名前を取得
    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

    // 画像を独立した段落として挿入し、その直下にキャプション段落を挿入する
    body.insertImage(insertIndex, blob);
    insertIndex++;
    lastCaptionParagraph = body.insertParagraph(insertIndex, baseName);
    insertIndex++;

    insertCount++;
  }

  // 挿入した最後のキャプションの末尾にカーソルを移動し、続けて編集できるようにする
  if (lastCaptionParagraph) {
    doc.setCursor(doc.newPosition(lastCaptionParagraph, lastCaptionParagraph.getNumChildren()));
  }

  return `正常に ${insertCount} 個の画像を挿入しました。`;
}
