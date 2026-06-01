'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// GAS では各 .js ファイルがグローバルスコープを共有し、関数宣言は全ファイルで参照できる。
// テストでも同じ状態を再現するため、対象の全スクリプトを同一コンテキストで評価する。
// （imageHelpers.js の純粋関数を コード.js から呼び出せるようにする。）
// 内容は不変なので、モジュール読み込み時に一度だけ読み込んでキャッシュする。
const SCRIPT_FILES = ['imageHelpers.js', 'コード.js'];
const sources = SCRIPT_FILES.map((name) => ({
  name,
  code: fs.readFileSync(path.resolve(__dirname, '..', '..', name), 'utf8'),
}));

// 各スクリプトはトップレベルでグローバル関数を宣言している純粋な Apps Script ファイル。
// ソースを変更せずにテストするため、GAS のグローバル（DocumentApp 等）を差し込んだ
// vm コンテキスト内でそのまま評価し、宣言された関数をコンテキスト経由で取り出す。
// vm.runInContext ではトップレベルの関数宣言がコンテキストのグローバルプロパティになる。
function loadGasScript(globals) {
  const context = Object.assign({ console }, globals);
  vm.createContext(context);
  for (const src of sources) {
    vm.runInContext(src.code, context, { filename: src.name });
  }
  return context;
}

module.exports = { loadGasScript };
