// アドオンが初回インストールされたときに実行される必須処理
function onInstall(e) {
  onOpen(e);
}

// Workspace Add-on のホームページカード（Marketplace SDK 要件）
function onHomepage(e) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('画像一括挿入'))
    .addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText(
          '「拡張機能」メニューから「画像を一括挿入」を選択してください。'
        )
      )
    )
    .build();
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
  let cursor = doc.getCursor();
  
  if (!cursor) {
    throw new Error('ドキュメント内にカーソルが見つかりません。挿入したい位置をクリックしてカーソルを点滅させてから再実行してください。');
  }

  // Google Docsが標準でサポートする主要なMIMEタイプ
  const supportedMimeTypes = [MimeType.PNG, MimeType.JPEG, MimeType.GIF];
  let insertCount = 0;

  // 受け取ったファイル配列をループ処理
  for (let i = 0; i < filesData.length; i++) {
    const file = filesData[i];
    
    // Base64データをデコードしてBlobオブジェクトを作成
    const contentType = file.type;
    const base64Data = file.data.split(',')[1];
    const decodedData = Utilities.base64Decode(base64Data);
    let blob = Utilities.newBlob(decodedData, contentType, file.name);
    
    // Docs非対応形式（BMPやTIFFなど）の場合、PNGに自動変換
    if (!supportedMimeTypes.includes(contentType)) {
      try {
        blob = blob.convertTo(MimeType.PNG);
      } catch (e) {
        // 直接安全にコンバートできない特殊バイナリはMIMEタイプを上書き補正
        blob.setContentType(MimeType.PNG);
      }
    }

    // カーソル位置に画像をインラインで挿入
    const imageElement = cursor.insertInlineImage(blob);
    
    // 元のファイル名から拡張子を除いた名前を取得
    const originalName = file.name;
    const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
    
    // 画像の直後に改行とファイル名を挿入
    const textElement = cursor.insertText('\n' + baseName + '\n');
    
    // 次の画像が直後に正しく並ぶよう、カーソル位置の終端をシミュレートして更新
    const nextPosition = doc.newPosition(textElement, textElement.getText().length);
    cursor = doc.setCursor(nextPosition);
    
    insertCount++;
  }
  
  return `正常に ${insertCount} 個の画像を挿入しました。`;
}
