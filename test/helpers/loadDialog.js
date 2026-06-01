'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const projectRoot = path.resolve(__dirname, '..', '..');

// GAS のテンプレート展開を再現する。Dialog.html 内の <?!= include('X') ?> を
// X.html の中身に置き換え、本番でブラウザに配信されるのと同じHTMLを組み立てる。
// 内容は不変なので、モジュール読み込み時に一度だけ解決してキャッシュする。
function resolveIncludes(html) {
  return html.replace(/<\?!=\s*include\('([^']+)'\)\s*\?>/g, (_, name) =>
    fs.readFileSync(path.join(projectRoot, name + '.html'), 'utf8')
  );
}
const html = resolveIncludes(fs.readFileSync(path.join(projectRoot, 'Dialog.html'), 'utf8'));

// Dialog.html を jsdom で読み込み、取り込んだ <script> を実行する。
// ブラウザ依存 API（FileReader / Image / canvas / google.script.run）はソースを
// 変更せずにテストするため、window 上のグローバルを差し替えて制御する。
function loadDialog() {
  const dom = new JSDOM(html, { runScripts: 'dangerously' });
  const win = dom.window;

  // テストから挙動を制御するための設定。
  const config = {
    imageFails: false, // convertToPng で画像読込が失敗するか
    canvasContextNull: false, // getContext('2d') が null を返すか
    pngDataUrl: 'data:image/png;base64,PNGDATA',
    onInsert: null, // insertSelectedImages 呼び出し時のフック
  };

  // FileReader: file._dataUrl を返す（_readFail で onerror）。
  win.FileReader = class {
    readAsDataURL(file) {
      setTimeout(() => {
        if (file && file._readFail) {
          if (this.onerror) this.onerror();
        } else if (this.onload) {
          this.onload({ target: { result: file ? file._dataUrl : null } });
        }
      }, 0);
    }
  };

  // Image: src 設定で onload / onerror を発火する。
  win.Image = class {
    constructor() {
      this.naturalWidth = 1;
      this.naturalHeight = 1;
    }
    set src(value) {
      this._src = value;
      setTimeout(() => {
        if (config.imageFails) {
          if (this.onerror) this.onerror();
        } else if (this.onload) {
          this.onload();
        }
      }, 0);
    }
    get src() {
      return this._src;
    }
  };

  // canvas: getContext / toDataURL を最小限再現する。
  const originalCreateElement = win.document.createElement.bind(win.document);
  win.document.createElement = (tagName) => {
    if (String(tagName).toLowerCase() === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => (config.canvasContextNull ? null : { drawImage: () => {} }),
        toDataURL: () => config.pngDataUrl,
      };
    }
    return originalCreateElement(tagName);
  };

  // google.script.run: チェーンを再現し、insertSelectedImages 受信を記録する。
  const runState = { successHandler: null, failureHandler: null, lastArgs: null };
  const run = {
    withSuccessHandler(fn) {
      runState.successHandler = fn;
      return run;
    },
    withFailureHandler(fn) {
      runState.failureHandler = fn;
      return run;
    },
    insertSelectedImages(filesData) {
      runState.lastArgs = filesData;
      if (config.onInsert) {
        config.onInsert(filesData, runState);
      }
    },
  };
  win.google = {
    script: {
      run,
      host: { close: () => {} },
    },
  };

  // host.close を検証できるよう監視する。
  win.google.script.host.close = jestCloseSpy();

  // 成功ハンドラ内の setTimeout(close, 1200) は遅延だけスキップし、非同期の実行順序は
  // 保ったまま検証できるよう、Node の setTimeout(fn, 0) に委譲する。
  // テスト側は flush()（setImmediate 待ち）で完了を待てる。
  win.setTimeout = (fn) => setTimeout(fn, 0);

  // input.files をテストから差し替えるためのユーティリティ。
  function setFiles(files) {
    const input = win.document.getElementById('fileInput');
    Object.defineProperty(input, 'files', {
      configurable: true,
      get: () => files,
    });
  }

  return { dom, window: win, config, runState, setFiles };
}

// jest.fn は Node 環境からも利用可能。close 監視用に薄くラップする。
function jestCloseSpy() {
  return jest.fn();
}

module.exports = { loadDialog };
