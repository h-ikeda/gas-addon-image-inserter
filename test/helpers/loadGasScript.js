'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// コード.js の内容は不変なので、モジュール読み込み時に一度だけ読み込んでキャッシュする。
const scriptPath = path.resolve(__dirname, '..', '..', 'コード.js');
const code = fs.readFileSync(scriptPath, 'utf8');

// コード.js はトップレベルでグローバル関数を宣言している純粋な Apps Script ファイル。
// ソースを変更せずにテストするため、GAS のグローバル（DocumentApp 等）を差し込んだ
// vm コンテキスト内でそのまま評価し、宣言された関数をコンテキスト経由で取り出す。
// vm.runInContext ではトップレベルの関数宣言がコンテキストのグローバルプロパティになる。
function loadGasScript(globals) {
  const context = Object.assign({ console }, globals);
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'コード.js' });
  return context;
}

module.exports = { loadGasScript };
