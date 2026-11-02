const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PNG } = require('pngjs');
const { findPreviewArray } = require('../out/previewParser');
const renderer = require('../out/previewRenderer');
const fs = require('node:fs');
const path = require('node:path');

const metadata = { type: '1bpp', width: 8, height: 8, layout: 'horizontal', bitOrder: 'lsb', sheet: { columns: 2 } };
const blank = Array(8).fill(0);
// Asymmetric F from dhepper/font8x8, public domain.
const letterF = [0x7f, 0x46, 0x16, 0x1e, 0x16, 0x06, 0x0f, 0];
function sourceFor(meta = metadata, body = `{${blank}}, // U+007B ({)\n{${letterF}}, /* } { */\n{${blank}} // U+007D (})`) {
    return `// @preview ${JSON.stringify(meta)}\nchar font[3][8] = {\n${body}\n};`;
}
function parse(source, offset = source.indexOf('font')) {
    return findPreviewArray({ getText: () => source }, offset);
}

test('sheet parser preserves child ranges, blank glyphs and ignores braces in comments', () => {
    const source = sourceFor();
    const result = parse(source);
    assert.equal(result.metadata.bitOrder, 'lsb');
    assert.equal(result.glyphs.length, 3);
    assert.deepEqual(result.glyphs.map(g => g.values), [blank, letterF, blank]);
    assert.equal(result.initializerEnd, source.lastIndexOf('}'));
    for (const glyph of result.glyphs) {
        assert.equal(source[glyph.start], '{');
        assert.equal(source[glyph.end], '}');
    }
});

test('metadata defaults and invalid sheet settings', () => {
    const base = { type: '1bpp', width: 8, height: 8, layout: 'horizontal' };
    assert.equal(parse(sourceFor(base)).metadata.bitOrder, 'msb');
    for (const patch of [{bitOrder:'bad'}, {bitOrder:null}, {sheet:null}, {sheet:{}}, {sheet:{columns:0}}, {sheet:{columns:1.5}}, {sheet:{columns:1000000}}, {packing:'unpacked'}, {type:'rgb565'}]) {
        assert.equal(parse(sourceFor({...metadata, ...patch})), undefined, JSON.stringify(patch));
    }
});

test('sheet parser rejects malformed cells instead of shifting later glyphs', () => {
    for (const body of ['', '0,1,2,3', '{1,2}', '{0,0,0,0,0,0,0,256}', '{-1,0,0,0,0,0,0,0}', '{MACRO,0,0,0,0,0,0,0}', '{{0,0,0,0,0,0,0,0}}']) {
        assert.equal(parse(sourceFor(metadata, body)), undefined, body);
    }
});

function decode(base64) { return PNG.sync.read(Buffer.from(base64, 'base64')); }
test('flat sheets split by glyph byte count and retain literal source ranges', () => {
    const body = `${blank}, /* { ignored } */\n${letterF.map(v => '0x' + v.toString(16)).join(', ')},\n${blank},`;
    const source = sourceFor(metadata, body).replace('[3][8]', '[]');
    const result = parse(source);
    assert.ok(result);
    assert.deepEqual(result.glyphs.map(g => g.values), [blank, letterF, blank]);
    assert.equal(source.slice(result.glyphs[1].start, result.glyphs[1].start + 4), '0x7f');
    assert.equal(source.slice(result.glyphs[1].end - 2, result.glyphs[1].end + 1), '0x0');
    assert.equal(renderer.render1bppSheet(result.glyphs.map(g => g.values), result.metadata),
        renderer.render1bppSheet([blank, letterF, blank], metadata));
});

test('flat sheet byte counts account for row/column padding and 16x16 glyphs', () => {
    for (const [width,height,layout,bytes] of [[16,16,'horizontal',32],[9,3,'horizontal',6],[9,3,'vertical',9]]) {
        const meta = {...metadata,width,height,layout};
        const result = parse(sourceFor(meta, Array(bytes * 2).fill(1).join(',')));
        assert.equal(result?.glyphs.length, 2);
        assert.equal(result.glyphs[0].values.length, bytes);
        assert.equal(parse(sourceFor(meta, Array(bytes * 2 - 1).fill(1).join(','))), undefined);
    }
});

test('flat sheets reject invalid tokens and mixed nested/flat initializers', () => {
    for (const body of ['0,0,0,0,0,0,0,256', '-1,0,0,0,0,0,0,0', 'X,0,0,0,0,0,0,0', '0,,0,0,0,0,0,0,0', `${blank},{${blank}}`, `{${blank}},${blank}`]) {
        assert.equal(parse(sourceFor(metadata,body)), undefined, body);
    }
});
function pixel(png, x, y) { return [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)]; }
test('LSB rendering matches font8x8 and MSB remains default', () => {
    const lsb = decode(renderer.render1bpp(letterF, 8, 8, 'horizontal', 'packed', 'lsb'));
    const msb = decode(renderer.render1bpp(letterF, 8, 8, 'horizontal'));
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const c = ((letterF[y] >> x) & 1) ? 0 : 255;
        assert.deepEqual(pixel(lsb, x * 4, y * 4), [c,c,c,255]);
        assert.deepEqual(pixel(msb, (7-x) * 4, y * 4), [c,c,c,255]);
    }
});

test('sheet joins glyphs without spacing, retains blank cells and scales as one image', () => {
    assert.equal(typeof renderer.render1bppSheet, 'function');
    const png = decode(renderer.render1bppSheet([blank, letterF, blank], metadata));
    assert.equal(png.width, 64); // (8 + 8) * 4
    assert.equal(png.height, 64);
    assert.deepEqual(pixel(png, 0, 0), [255,255,255,255]);
    assert.deepEqual(pixel(png, 31, 0), [255,255,255,255]);
    assert.deepEqual(pixel(png, 32, 0), [0,0,0,255]);
    assert.deepEqual(pixel(png, 32, 32), [255,255,255,255]);
    const full = decode(renderer.render1bppSheet(Array(128).fill(blank), {...metadata, sheet:{columns:16}}));
    assert.equal(full.width, 256);
    assert.equal(full.height, 128);
});

test('real font8x8_basic fixture parses all 128 glyphs including brace comments', () => {
    const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/font8x8_basic.h'), 'utf8');
    const source = fixture.replace('char font8x8_basic', `// @preview ${JSON.stringify({...metadata, sheet:{columns:16}})}\nchar font8x8_basic`);
    const result = parse(source, source.indexOf('font8x8_basic[128]'));
    assert.equal(result.glyphs.length, 128);
    assert.deepEqual(result.glyphs[70].values, letterF);
    assert.equal(result.initializerEnd, source.lastIndexOf('}'));
    const png = decode(renderer.render1bppSheet(result.glyphs.map(g => g.values), result.metadata));
    // 16 columns: F is cell (6, 4); at 2x scale.
    assert.deepEqual(pixel(png, 96, 64), [0,0,0,255]);
    assert.deepEqual(pixel(png, 110, 64), [255,255,255,255]);
});

test('vertical LSB and multi-byte rows preserve byte boundaries', () => {
    const vertical = decode(renderer.render1bpp([1, 2], 2, 8, 'vertical', 'packed', 'lsb'));
    assert.deepEqual(pixel(vertical, 0, 0), [0,0,0,255]);
    assert.deepEqual(pixel(vertical, 4, 4), [0,0,0,255]);
    const horizontal = decode(renderer.render1bpp([1, 1], 9, 1, 'horizontal', 'packed', 'lsb'));
    assert.deepEqual(pixel(horizontal, 32, 0), [0,0,0,255]);
});

test('sheet allocation is bounded', () => {
    assert.throws(() => renderer.render1bppSheet([blank, blank], {...metadata, width:1024, height:1024}));
});

test('hover selects a single glyph inside its braces and a sheet at the array name', () => {
    // Only the VS Code host API is stubbed; parser and PNG rendering run normally.
    const Module = require('node:module');
    const originalLoad = Module._load;
    let provider;
    const vscode = {
        languages: { registerHoverProvider: (_languages, value) => { provider = value; return {dispose(){}}; } },
        MarkdownString: class { value = ''; appendMarkdown(value) { this.value += value; return this; } },
        Hover: class { constructor(contents) { this.contents = contents; } }
    };
    try {
        Module._load = function(id, ...args) { return id === 'vscode' ? vscode : originalLoad.call(this, id, ...args); };
        require('../out/extension').activate({subscriptions:[]});
    } finally { Module._load = originalLoad; }
    const source = sourceFor();
    const document = {getText: () => source, offsetAt: position => position};
    const parsed = parse(source);
    const single = provider.provideHover(document, parsed.glyphs[1].start + 2).contents.value;
    const sheet = provider.provideHover(document, source.indexOf('font')).contents.value;
    assert.match(single, /font\[1\]/);
    assert.match(sheet, /3 glyphs/);
    const pngFromHover = value => decode(value.match(/base64,([^)]*)/)[1]);
    assert.equal(pngFromHover(single).width, 32);
    assert.equal(pngFromHover(sheet).width, 64);
    const flatSource = sourceFor(metadata, `${blank},\n${letterF},\n${blank}`).replace('[3][8]', '[]');
    const flatDocument = {getText: () => flatSource, offsetAt: position => position};
    const flat = parse(flatSource);
    for (const position of [flat.glyphs[1].start, flat.glyphs[1].end]) {
        const hover = provider.provideHover(flatDocument, position).contents.value;
        assert.match(hover, /font\[1\]/);
        assert.equal(pngFromHover(hover).width, 32);
    }
    assert.match(provider.provideHover(flatDocument, flatSource.indexOf('font')).contents.value, /3 glyphs/);
});
