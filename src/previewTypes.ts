export type PreviewLayout =
    | "horizontal"
    | "vertical";

export type PreviewPacking = "packed" | "unpacked";
export type PreviewBitOrder = "msb" | "lsb";

export interface PreviewMetadata {
    type: "1bpp" | "rgb565";
    width: number;
    height: number;
    layout: PreviewLayout;
    packing: PreviewPacking;
    bitOrder: PreviewBitOrder;
    sheet?: { columns: number };
}

export interface PreviewGlyph {
    values: number[];
    start: number;
    end: number;
}

export interface PreviewArray {
    metadata: PreviewMetadata;
    name: string;
    values: number[];
    glyphs?: PreviewGlyph[];

    declarationStart: number;
    initializerStart: number;
    initializerEnd: number;
}
