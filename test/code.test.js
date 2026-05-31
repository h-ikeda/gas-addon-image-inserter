'use strict';

const { loadGasScript } = require('./helpers/loadGasScript');
const { createGasEnv, makeElement } = require('./helpers/mockGas');

// テスト対象の Apps Script 関数を、モック GAS 環境を差し込んで読み込むヘルパー。
function load(envOptions) {
  const env = createGasEnv(envOptions);
  const ctx = loadGasScript(env.globals);
  return { env, ctx };
}

// 与えられた MIME / 名前から、ダイアログが送ってくる形のファイルデータを作る。
function makeFile(name, type, payload) {
  return {
    name,
    type,
    data: 'data:' + type + ';base64,' + (payload || 'AAAA'),
  };
}

describe('onInstall / onOpen', () => {
  test('onOpen はアドオンメニューに「画像を一括挿入」を登録する', () => {
    const { env, ctx } = load();

    ctx.onOpen({});

    expect(env.ui.createAddonMenu).toHaveBeenCalledTimes(1);
    expect(env.menu.addItem).toHaveBeenCalledWith('画像を一括挿入', 'showImagePickerDialog');
    expect(env.menu.addToUi).toHaveBeenCalledTimes(1);
  });

  test('onInstall は onOpen と同じメニュー登録を行う', () => {
    const { env, ctx } = load();

    ctx.onInstall({});

    expect(env.ui.createAddonMenu).toHaveBeenCalledTimes(1);
    expect(env.menu.addItem).toHaveBeenCalledWith('画像を一括挿入', 'showImagePickerDialog');
    expect(env.menu.addToUi).toHaveBeenCalledTimes(1);
  });
});

describe('showImagePickerDialog', () => {
  test('Dialog からモーダルを生成し、サイズ・タイトルを設定して表示する', () => {
    const { env, ctx } = load();

    ctx.showImagePickerDialog();

    expect(env.globals.HtmlService.createHtmlOutputFromFile).toHaveBeenCalledWith('Dialog');
    expect(env.htmlOutput.setWidth).toHaveBeenCalledWith(450);
    expect(env.htmlOutput.setHeight).toHaveBeenCalledWith(300);
    expect(env.htmlOutput.setTitle).toHaveBeenCalledWith('挿入する画像ファイルの選択');
    expect(env.ui.showModalDialog).toHaveBeenCalledWith(env.htmlOutput, '画像の選択');
  });
});

describe('insertSelectedImages', () => {
  test('カーソルが無い場合はエラーを投げる', () => {
    const { ctx } = load({ hasCursor: false });

    expect(() => ctx.insertSelectedImages([makeFile('a.png', 'image/png')]))
      .toThrow('ドキュメント内にカーソルが見つかりません。挿入したい位置をクリックしてカーソルを点滅させてから再実行してください。');
  });

  test('対応形式(PNG)を1枚挿入し、デコード・Blob生成・挿入・カーソル移動を行う', () => {
    const { env, ctx } = load({ childIndex: 2 });

    const result = ctx.insertSelectedImages([makeFile('photo.png', 'image/png', 'ABCD')]);

    // Base64 のヘッダを除いた部分をデコードする
    expect(env.globals.Utilities.base64Decode).toHaveBeenCalledWith('ABCD');
    // 対応形式なので type はそのまま Blob 化される
    expect(env.globals.Utilities.newBlob).toHaveBeenCalledWith(
      { _decoded: 'ABCD' },
      'image/png',
      'photo.png'
    );

    // childIndex(2) の直後(3)に画像、続けて(4)にキャプション段落
    expect(env.body.insertImage).toHaveBeenCalledWith(3, env.createdBlobs[0]);
    expect(env.body.insertParagraph).toHaveBeenCalledWith(4, 'photo');

    // 最後のキャプション末尾へカーソルを移動する
    expect(env.doc.setCursor).toHaveBeenCalledTimes(1);
    const lastParagraph = env.insertedParagraphs[env.insertedParagraphs.length - 1];
    expect(env.doc.newPosition).toHaveBeenCalledWith(lastParagraph, 1);

    expect(result).toBe('正常に 1 個の画像を挿入しました。');
  });

  test('複数枚を挿入位置をインクリメントしながら順に挿入する', () => {
    const { env, ctx } = load({ childIndex: 0 });

    const result = ctx.insertSelectedImages([
      makeFile('a.png', 'image/png'),
      makeFile('b.jpg', 'image/jpeg'),
      makeFile('c.gif', 'image/gif'),
    ]);

    // 開始 index は childIndex(0)+1 = 1。画像→段落で 2 ずつ進む。
    expect(env.body.insertImage.mock.calls.map((c) => c[0])).toEqual([1, 3, 5]);
    expect(env.body.insertParagraph.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [2, 'a'],
      [4, 'b'],
      [6, 'c'],
    ]);
    expect(result).toBe('正常に 3 個の画像を挿入しました。');
  });

  test('拡張子の無いファイル名はそのままキャプションに使う', () => {
    const { env, ctx } = load();

    ctx.insertSelectedImages([makeFile('noext', 'image/png')]);

    expect(env.body.insertParagraph).toHaveBeenCalledWith(expect.any(Number), 'noext');
  });

  test('複数のドットを含む名前は最後のドットより前をキャプションにする', () => {
    const { env, ctx } = load();

    ctx.insertSelectedImages([makeFile('my.photo.final.jpeg', 'image/jpeg')]);

    expect(env.body.insertParagraph).toHaveBeenCalledWith(expect.any(Number), 'my.photo.final');
  });

  test('非対応形式は PNG への変換を試み、変換後の Blob を挿入する', () => {
    const { env, ctx } = load();

    ctx.insertSelectedImages([makeFile('image.bmp', 'image/bmp')]);

    // 最初に作られた Blob に対して PNG への getAs が呼ばれる
    const originalBlob = env.createdBlobs[0];
    expect(originalBlob.getAs).toHaveBeenCalledWith('image/png');

    // 挿入されるのは変換後（PNG）の Blob
    const convertedBlob = originalBlob.getAs.mock.results[0].value;
    expect(env.body.insertImage).toHaveBeenCalledWith(expect.any(Number), convertedBlob);
  });

  test('非対応形式の変換に失敗した場合は分かりやすいエラーを投げる', () => {
    const { ctx } = load({ getAsThrows: true });

    expect(() => ctx.insertSelectedImages([makeFile('weird.heic', 'image/heic')]))
      .toThrow('「weird.heic」はサポートされていない画像形式です。PNG・JPEG・GIF のいずれかに変換してから挿入してください。');
  });

  test('ファイルが0件のときは何も挿入せずカーソルも移動しない', () => {
    const { env, ctx } = load();

    const result = ctx.insertSelectedImages([]);

    expect(env.body.insertImage).not.toHaveBeenCalled();
    expect(env.body.insertParagraph).not.toHaveBeenCalled();
    expect(env.doc.setCursor).not.toHaveBeenCalled();
    expect(result).toBe('正常に 0 個の画像を挿入しました。');
  });

  test('カーソルがネストした要素にある場合は本文直下の要素まで遡って挿入位置を決める', () => {
    const { env, ctx } = load({ childIndex: 7 });

    // 本文セクション → 段落(本文直下) → インライン要素（カーソル位置）の階層を作る
    const topParagraph = makeElement('PARAGRAPH', env.bodySection);
    const inlineChild = makeElement('TEXT', topParagraph);
    // カーソルはインライン要素を指すよう差し替える
    env.cursor.getElement.mockReturnValue(inlineChild);

    ctx.insertSelectedImages([makeFile('x.png', 'image/png')]);

    // getChildIndex には本文直下の段落（topParagraph）が渡されるべき
    expect(env.body.getChildIndex).toHaveBeenCalledWith(topParagraph);
    // childIndex(7)+1 = 8 から挿入が始まる
    expect(env.body.insertImage).toHaveBeenCalledWith(8, expect.anything());
  });
});
