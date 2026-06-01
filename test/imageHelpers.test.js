'use strict';

const { loadGasScript } = require('./helpers/loadGasScript');
const { createGasEnv, makeElement } = require('./helpers/mockGas');

// 純粋ヘルパーは GAS API に依存しないが、GAS と同じくグローバル関数として
// 読み込まれるため、共通ローダー経由で取り出して直接テストする。
const ctx = loadGasScript(createGasEnv().globals);

describe('extractBase64Data', () => {
  test('Data URL から Base64 本体だけを取り出す', () => {
    expect(ctx.extractBase64Data('data:image/png;base64,ABCD')).toBe('ABCD');
  });

  test('null / カンマを含まない不正な入力は空文字を返す', () => {
    expect(ctx.extractBase64Data(null)).toBe('');
    expect(ctx.extractBase64Data('')).toBe('');
    expect(ctx.extractBase64Data('not-a-data-url')).toBe('');
  });
});

describe('getImageBaseName', () => {
  test('拡張子を取り除く', () => {
    expect(ctx.getImageBaseName('photo.png')).toBe('photo');
  });

  test('複数のドットは最後のドットより前を残す', () => {
    expect(ctx.getImageBaseName('my.photo.final.jpeg')).toBe('my.photo.final');
  });

  test('拡張子が無ければ元の名前を返す', () => {
    expect(ctx.getImageBaseName('noext')).toBe('noext');
  });

  test('先頭がドットのファイル名は元の名前を返す', () => {
    expect(ctx.getImageBaseName('.gitignore')).toBe('.gitignore');
  });

  test('null / 空文字は空文字を返す', () => {
    expect(ctx.getImageBaseName(null)).toBe('');
    expect(ctx.getImageBaseName('')).toBe('');
  });
});

describe('isDocsSupportedImageType', () => {
  const supported = ['image/png', 'image/jpeg', 'image/gif'];

  test('対応形式は true', () => {
    expect(ctx.isDocsSupportedImageType('image/png', supported)).toBe(true);
  });

  test('非対応形式は false', () => {
    expect(ctx.isDocsSupportedImageType('image/bmp', supported)).toBe(false);
  });
});

describe('findTopLevelElement', () => {
  test('本文直下の要素はそのまま返す', () => {
    const bodySection = makeElement('BODY_SECTION', null);
    const paragraph = makeElement('PARAGRAPH', bodySection);

    expect(ctx.findTopLevelElement(paragraph, 'BODY_SECTION')).toBe(paragraph);
  });

  test('ネストした要素は本文直下の祖先まで遡る', () => {
    const bodySection = makeElement('BODY_SECTION', null);
    const paragraph = makeElement('PARAGRAPH', bodySection);
    const inlineChild = makeElement('TEXT', paragraph);

    expect(ctx.findTopLevelElement(inlineChild, 'BODY_SECTION')).toBe(paragraph);
  });

  test('親が無い要素はそのまま返す', () => {
    const orphan = makeElement('PARAGRAPH', null);

    expect(ctx.findTopLevelElement(orphan, 'BODY_SECTION')).toBe(orphan);
  });

  test('要素が null の場合は null を返す', () => {
    expect(ctx.findTopLevelElement(null, 'BODY_SECTION')).toBeNull();
  });
});
