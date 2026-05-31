'use strict';

const { loadDialog } = require('./helpers/loadDialog');

// 保留中のタイマー（FileReader / Image のモックや成功ハンドラの close は
// setTimeout(...,0) で発火する）を消化するまで待つ。
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeFile(name, type, dataUrl, extra) {
  return Object.assign({ name, type, _dataUrl: dataUrl }, extra || {});
}

describe('updateFileStatus', () => {
  test('ファイル選択時は件数を表示し、送信ボタンを有効化する', () => {
    const { window, setFiles } = loadDialog();
    setFiles([makeFile('a.png', 'image/png'), makeFile('b.png', 'image/png')]);

    window.updateFileStatus();

    expect(window.document.getElementById('status').innerText).toBe('2 個のファイルが選択されています');
    expect(window.document.getElementById('submitBtn').disabled).toBe(false);
  });

  test('未選択時はメッセージを戻し、送信ボタンを無効化する', () => {
    const { window, setFiles } = loadDialog();
    setFiles([]);

    window.updateFileStatus();

    expect(window.document.getElementById('status').innerText).toBe('ファイルが選択されていません');
    expect(window.document.getElementById('submitBtn').disabled).toBe(true);
  });
});

describe('processFile', () => {
  test('対応形式はそのまま data URL を付けて返す', async () => {
    const { window } = loadDialog();
    const file = makeFile('photo.png', 'image/png', 'data:image/png;base64,AAAA');

    const result = await window.processFile(file);

    expect(result).toEqual({
      name: 'photo.png',
      type: 'image/png',
      data: 'data:image/png;base64,AAAA',
    });
  });

  test('非対応形式は canvas を介して PNG に変換し、拡張子を .png に置き換える', async () => {
    const { window, config } = loadDialog();
    config.pngDataUrl = 'data:image/png;base64,CONVERTED';
    const file = makeFile('drawing.bmp', 'image/bmp', 'data:image/bmp;base64,BBBB');

    const result = await window.processFile(file);

    expect(result).toEqual({
      name: 'drawing.png',
      type: 'image/png',
      data: 'data:image/png;base64,CONVERTED',
    });
  });

  test('非対応形式でブラウザが画像を表示できない場合は変換エラーになる', async () => {
    const { window, config } = loadDialog();
    config.imageFails = true;
    const file = makeFile('photo.heic', 'image/heic', 'data:image/heic;base64,HHHH');

    await expect(window.processFile(file)).rejects.toThrow(
      '「photo.heic」はこのブラウザで表示できない形式のため変換できません（HEIC/TIFF は Chrome では非対応です。Safari をお使いください）。'
    );
  });

  test('ファイル読み込みに失敗した場合はエラーを投げる', async () => {
    const { window } = loadDialog();
    const file = makeFile('broken.png', 'image/png', null, { _readFail: true });

    await expect(window.processFile(file)).rejects.toThrow('「broken.png」の読み込みに失敗しました。');
  });
});

describe('uploadFiles', () => {
  test('成功時は処理状況を更新し、サーバへ整形済みデータを渡してダイアログを閉じる', async () => {
    const { window, config, runState, setFiles } = loadDialog();

    setFiles([makeFile('a.png', 'image/png', 'data:image/png;base64,AAAA')]);
    // サーバ側成功を模擬してメッセージを返す
    config.onInsert = (filesData, state) => {
      state.successHandler('正常に 1 個の画像を挿入しました。');
    };

    await window.uploadFiles();
    await flush();

    // サーバへ渡したデータは整形済み（data URL 付き）
    expect(runState.lastArgs).toEqual([
      { name: 'a.png', type: 'image/png', data: 'data:image/png;base64,AAAA' },
    ]);
    expect(window.document.getElementById('status').innerText).toBe('正常に 1 個の画像を挿入しました。');
    // setTimeout は即時実行に差し替えてあるため close が呼ばれる
    expect(window.google.script.host.close).toHaveBeenCalledTimes(1);
  });

  test('サーバ失敗時はエラーメッセージを表示し、送信ボタンを再度有効化する', async () => {
    const { window, config, setFiles } = loadDialog();

    setFiles([makeFile('a.png', 'image/png', 'data:image/png;base64,AAAA')]);
    config.onInsert = (filesData, state) => {
      state.failureHandler(new Error('挿入に失敗しました'));
    };

    await window.uploadFiles();
    await flush();

    expect(window.document.getElementById('status').innerText).toBe('エラー: 挿入に失敗しました');
    expect(window.document.getElementById('submitBtn').disabled).toBe(false);
  });

  test('クライアント側の前処理で失敗した場合はサーバへ送らずエラー表示する', async () => {
    const { window, runState, setFiles } = loadDialog();

    // 読み込み失敗するファイルを混ぜる
    setFiles([makeFile('broken.png', 'image/png', null, { _readFail: true })]);

    await window.uploadFiles();
    await flush();

    expect(runState.lastArgs).toBeNull();
    expect(window.document.getElementById('status').innerText).toBe('エラー: 「broken.png」の読み込みに失敗しました。');
    expect(window.document.getElementById('submitBtn').disabled).toBe(false);
  });
});
