'use strict';

// コード.js が利用する Google Apps Script のグローバル API を再現する軽量モック群。
// jest.fn() で各呼び出しを記録し、テストから引数・呼び出し回数を検証できるようにする。

const MimeType = {
  PNG: 'image/png',
  JPEG: 'image/jpeg',
  GIF: 'image/gif',
};

const ElementType = {
  BODY_SECTION: 'BODY_SECTION',
  PARAGRAPH: 'PARAGRAPH',
};

// ドキュメント要素のモックを生成する。getParent / getType / getNumChildren を持つ。
function makeElement(type, parent, numChildren) {
  const el = {
    _type: type,
    _parent: parent || null,
    getType: jest.fn(() => el._type),
    getParent: jest.fn(() => el._parent),
    getNumChildren: jest.fn(() => (numChildren == null ? 0 : numChildren)),
  };
  return el;
}

// Blob のモックを生成する。getAs は変換後の Blob を返すか、設定に応じて例外を投げる。
function makeBlob(type, name, getAsThrows) {
  const blob = {
    _type: type,
    _name: name,
    getAs: jest.fn((targetType) => {
      if (getAsThrows) {
        throw new Error('変換に失敗しました（モック）');
      }
      return makeBlob(targetType, name, false);
    }),
  };
  return blob;
}

/**
 * GAS 環境一式を生成する。
 *
 * options:
 *   hasCursor     カーソルの有無（false で getCursor() が null を返す）
 *   childIndex    body.getChildIndex() が返す値（挿入位置の基準）
 *   cursorElement カーソルが指す要素（未指定なら本文直下の段落を自動生成）
 *   getAsThrows   非対応形式の PNG 変換（blob.getAs）で例外を投げるか
 */
function createGasEnv(options) {
  const opts = options || {};
  const childIndex = opts.childIndex == null ? 2 : opts.childIndex;
  const getAsThrows = !!opts.getAsThrows;

  // 本文セクションと、その直下の段落（既定のカーソル要素）。
  const bodySection = makeElement(ElementType.BODY_SECTION, null);
  const defaultParagraph = makeElement(ElementType.PARAGRAPH, bodySection);
  const cursorElement = opts.cursorElement || defaultParagraph;

  const insertedParagraphs = [];

  const body = {
    getChildIndex: jest.fn(() => childIndex),
    insertImage: jest.fn(),
    insertParagraph: jest.fn((index, text) => {
      const para = makeElement(ElementType.PARAGRAPH, bodySection, 1);
      para._text = text;
      insertedParagraphs.push(para);
      return para;
    }),
  };

  const cursor = {
    getElement: jest.fn(() => cursorElement),
  };

  const doc = {
    getCursor: jest.fn(() => (opts.hasCursor === false ? null : cursor)),
    getBody: jest.fn(() => body),
    newPosition: jest.fn((element, offset) => ({ element, offset })),
    setCursor: jest.fn(),
  };

  // UI / メニュー（onOpen / showImagePickerDialog 用）。チェーン呼び出しを再現する。
  const menu = {
    addItem: jest.fn(() => menu),
    addToUi: jest.fn(() => menu),
  };
  const ui = {
    createAddonMenu: jest.fn(() => menu),
    showModalDialog: jest.fn(),
  };

  const DocumentApp = {
    ElementType,
    getActiveDocument: jest.fn(() => doc),
    getUi: jest.fn(() => ui),
  };

  // HtmlService（showImagePickerDialog / include 用）。setter はチェーンのため自身を返す。
  const htmlOutput = {
    setWidth: jest.fn(() => htmlOutput),
    setHeight: jest.fn(() => htmlOutput),
    setTitle: jest.fn(() => htmlOutput),
    // include() が呼ぶ getContent（取り込まれる HTML の中身）
    getContent: jest.fn(() => '<included-content>'),
  };
  // createTemplateFromFile('Dialog').evaluate() で htmlOutput を返すテンプレート
  const template = {
    evaluate: jest.fn(() => htmlOutput),
  };
  const HtmlService = {
    createTemplateFromFile: jest.fn(() => template),
    createHtmlOutputFromFile: jest.fn(() => htmlOutput),
  };

  const createdBlobs = [];
  const Utilities = {
    base64Decode: jest.fn((data) => ({ _decoded: data })),
    newBlob: jest.fn((data, type, name) => {
      const blob = makeBlob(type, name, getAsThrows);
      blob._data = data;
      createdBlobs.push(blob);
      return blob;
    }),
  };

  const globals = {
    DocumentApp,
    HtmlService,
    Utilities,
    MimeType,
  };

  return {
    globals,
    // 検証用に内部参照を公開する
    doc,
    body,
    cursor,
    ui,
    menu,
    htmlOutput,
    template,
    bodySection,
    defaultParagraph,
    cursorElement,
    insertedParagraphs,
    createdBlobs,
    MimeType,
    ElementType,
  };
}

module.exports = { createGasEnv, makeElement, makeBlob, MimeType, ElementType };
