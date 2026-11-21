const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PNG } = require('pngjs');
const { findPreviewArray } = require('../out/previewParser');
const renderer = require('../out/previewRenderer');

function sourceFor(values, extra = {}) {
    return `// @preview ${JSON.stringify({type:'bgr565',width:1,height:1,layout:'horizontal',...extra})}\nconst uint8_t image[] = {${values}};`;
}
test('BGR565 accepts byte metadata and rejects unsupported options', () => {
    const parse = extra => {
        const source = sourceFor('31,0', extra);
        return findPreviewArray({getText:()=>source}, source.indexOf('image'));
    };
    assert.equal(parse()?.metadata.type, 'bgr565');
    assert.equal(parse().metadata.packing, 'packed');
    for (const extra of [{packing:'unpacked'}, {bitOrder:'lsb'}, {sheet:{columns:1}}]) {
        assert.equal(parse(extra), undefined);
    }
});

test('BGR565 decodes LE colors and unequal red/blue levels in both layouts', () => {
    assert.equal(typeof renderer.renderBgr565, 'function');
    const words = [0x001f,0x07e0,0xf800,0xffff,0,0x1091];
    const expected = [[255,0,0],[0,255,0],[0,0,255],[255,255,255],[0,0,0],[140,16,16]];
    for (const layout of ['horizontal','vertical']) {
        const order = layout === 'horizontal' ? words : [words[0],words[3],words[1],words[4],words[2],words[5]];
        const bytes = order.flatMap(word=>[word & 255,word >> 8]);
        const png = PNG.sync.read(Buffer.from(renderer.renderBgr565(bytes,3,2,layout),'base64'));
        for (let y=0;y<png.height;y++) for(let x=0;x<png.width;x++) {
            const offset=(y*png.width+x)*4;
            assert.deepEqual([...png.data.subarray(offset,offset+4)],[...expected[Math.floor(y/4)*3+Math.floor(x/4)],255]);
        }
    }
});

test('BGR565 hover dispatches color renderer and validates byte length/range', () => {
    const Module = require('node:module');
    const load = Module._load;
    let provider;
    const vscode = {
        languages:{registerHoverProvider:(_,p)=>{provider=p;return {dispose(){}};}},
        MarkdownString:class {value='';appendMarkdown(value){this.value+=value;}},
        Hover:class {constructor(contents){this.contents=contents;}}
    };
    try {
        Module._load=function(id,...args){return id==='vscode'?vscode:load.call(this,id,...args);};
        require('../out/extension').activate({subscriptions:[]});
    } finally {Module._load=load;}
    const hover = values => {
        const source=sourceFor(values);
        return provider.provideHover({getText:()=>source,offsetAt:p=>p},source.indexOf('image'));
    };
    assert.match(hover('31').contents.value,/1\/2 bytes/);
    assert.match(hover('256,0').contents,/BGR565 requires 8-bit/);
    const content=hover('31,0').contents.value;
    assert.match(content,/bgr565/);
    const png=PNG.sync.read(Buffer.from(content.match(/base64,([^)]*)/)[1],'base64'));
    assert.deepEqual([...png.data.subarray(0,4)],[255,0,0,255]);
});
