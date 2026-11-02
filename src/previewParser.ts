import * as vscode from "vscode";
import { getSheetSize } from "./previewSheet";
import {
    PreviewArray,
    PreviewMetadata,
    PreviewGlyph
} from "./previewTypes";

export function findPreviewArray(
    document: vscode.TextDocument,
    hoverOffset: number
): PreviewArray | undefined {
    const source = document.getText();
    // Keep offsets intact while excluding comments from structural scanning.
    const structure = maskComments(source);

    const arrayPattern =
        /\b([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)+=\s*\{/g;

    let match: RegExpExecArray | null;

    while ((match = arrayPattern.exec(structure)) !== null) {
        const name = match[1];

        // 정규식이 찾은 배열 이름의 시작 위치
        const nameStart = match.index;

        // 현재 선언문이 있는 줄의 시작 위치
        const declarationStart =
            source.lastIndexOf("\n", nameStart) + 1;

        const initializerStart =
            match.index + match[0].lastIndexOf("{");

        const initializerEnd = findMatchingBrace(
            structure,
            initializerStart
        );

        if (initializerEnd < 0) {
            continue;
        }

        // 배열 이름 또는 배열 데이터 위에서만 Hover 표시
        if (
            hoverOffset < nameStart ||
            hoverOffset > initializerEnd
        ) {
            continue;
        }

        const metadata = findPreviewMetadata(
            source,
            declarationStart
        );

        if (!metadata) {
            return;
        }

        const initializerBody = source.slice(
            initializerStart + 1,
            initializerEnd
        );

        const glyphs = metadata.sheet
            ? parseGlyphs(structure, initializerStart, initializerEnd, metadata)
            : undefined;
        if (metadata.sheet && (!glyphs || !getSheetSize(
            metadata.width, metadata.height, glyphs.length, metadata.sheet.columns
        ))) {
            return;
        }

        return {
            metadata,
            name,
            values: parseArrayValues(initializerBody),
            glyphs,
            declarationStart,
            initializerStart,
            initializerEnd
        };
    }

    return;
}

function findPreviewMetadata(
    source: string,
    declarationStart: number
): PreviewMetadata | undefined {
    const beforeDeclaration = source
        .slice(0, declarationStart)
        .trimEnd();

    let comment: string | undefined;

    if (beforeDeclaration.endsWith("*/")) {
        const commentStart = beforeDeclaration.lastIndexOf("/*");

        if (commentStart >= 0) {
            comment = beforeDeclaration.slice(commentStart);
        }
    } else {
        const lines = beforeDeclaration.split(/\r?\n/);
        const commentLines: string[] = [];

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();

            if (!line.startsWith("//")) {
                break;
            }

            commentLines.unshift(line);
        }

        if (commentLines.length > 0) {
            comment = commentLines.join("\n");
        }
    }

    if (!comment) {
        return;
    }

    const match = comment.match(
        /(?:^|\r?\n)\s*(?:\/\/\s*|\*\s*)?@preview\s+(\{[^\r\n]*\})/
    );

    if (!match) {
        return;
    }

    return parseMetadata(match[1]);
}

function parseMetadata(
    text: string
): PreviewMetadata | undefined {
    let raw: unknown;

    try {
        raw = JSON.parse(text);
    } catch {
        return;
    }

    if (
        typeof raw !== "object" ||
        raw === null
    ) {
        return;
    }

    const value = raw as Record<string, unknown>;

    if (value.type !== "1bpp" && value.type !== "rgb565") {
        return;
    }

    if (
        !Number.isInteger(value.width) ||
        !Number.isInteger(value.height)
    ) {
        return;
    }

    if (
        value.layout !== "horizontal" &&
        value.layout !== "vertical"
    ) {
        return;
    }

    const width = value.width as number;
    const packing = value.packing === undefined ? "packed" : value.packing;

    if (packing !== "packed" && packing !== "unpacked") {
        return;
    }

    // RGB565 currently supports only packed, little-endian byte arrays.
    if (value.type === "rgb565" && packing !== "packed") {
        return;
    }

    const height = value.height as number;
    const bitOrder = value.bitOrder === undefined ? "msb" : value.bitOrder;
    if (bitOrder !== "msb" && bitOrder !== "lsb") {
        return;
    }
    if (value.type === "rgb565" && value.bitOrder !== undefined) {
        return;
    }

    let sheet: PreviewMetadata["sheet"];
    if (value.sheet !== undefined) {
        if (value.type !== "1bpp" || packing !== "packed" ||
            typeof value.sheet !== "object" || value.sheet === null || Array.isArray(value.sheet)) {
            return;
        }
        const columns = (value.sheet as Record<string, unknown>).columns;
        if (!Number.isSafeInteger(columns) || (columns as number) < 1 || (columns as number) > 1024) {
            return;
        }
        sheet = { columns: columns as number };
    }

    if (width <= 0 || height <= 0) {
        return;
    }

    if (width * height > 1024 * 1024) {
        return;
    }

    return {
        type: value.type,
        width,
        height,
        layout: value.layout,
        packing,
        bitOrder,
        sheet
    };
}

function maskComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
        comment => comment.replace(/[^\r\n]/g, " "));
}

function parseGlyphs(
    source: string, start: number, end: number, metadata: PreviewMetadata
): PreviewGlyph[] | undefined {
    const glyphs: PreviewGlyph[] = [];
    const expected = metadata.layout === "horizontal"
        ? Math.ceil(metadata.width / 8) * metadata.height
        : Math.ceil(metadata.height / 8) * metadata.width;
    const body = source.slice(start + 1, end);
    if (!body.trimStart().startsWith("{")) {
        return parseFlatGlyphs(body, start + 1, expected);
    }
    let cursor = start + 1;
    while (cursor < end) {
        while (/\s/.test(source[cursor] ?? "") && cursor < end) { cursor++; }
        if (cursor === end) { break; }
        if (source[cursor] !== "{") { return; }
        const close = findMatchingBrace(source, cursor);
        if (close < 0 || close >= end) { return; }
        const body = source.slice(cursor + 1, close).trim().replace(/,\s*$/, "");
        const tokens = body.split(",").map(token => token.trim());
        if (tokens.length !== expected || tokens.some(token =>
            !/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0|[1-9]\d*)$/.test(token)
        )) { return; }
        const values = tokens.map(parseIntegerLiteral);
        if (values.some(value => value > 255)) { return; }
        glyphs.push({ values, start: cursor, end: close });
        cursor = close + 1;
        while (cursor < end && /\s/.test(source[cursor])) { cursor++; }
        if (cursor < end) {
            if (source[cursor] !== ",") { return; }
            cursor++;
        }
    }
    return glyphs.length ? glyphs : undefined;
}

function parseFlatGlyphs(body: string, offset: number, bytesPerGlyph: number): PreviewGlyph[] | undefined {
    const literal = /\s*(0[xX][0-9a-fA-F]+|0[bB][01]+|0|[1-9]\d*)\s*(,|$)/y;
    const glyphs: PreviewGlyph[] = [];
    let values: number[] = [];
    let glyphStart = offset;
    let cursor = 0;
    while (cursor < body.length) {
        while (cursor < body.length && /\s/.test(body[cursor])) { cursor++; }
        if (cursor === body.length) { break; }
        literal.lastIndex = cursor;
        const match = literal.exec(body);
        if (!match) { return; }
        const value = parseIntegerLiteral(match[1]);
        if (value > 255) { return; }
        if (values.length === 0) { glyphStart = offset + cursor; }
        values.push(value);
        const tokenEnd = offset + cursor + match[1].length - 1;
        if (values.length === bytesPerGlyph) {
            glyphs.push({ values, start: glyphStart, end: tokenEnd });
            values = [];
        }
        cursor = literal.lastIndex;
    }
    return glyphs.length && values.length === 0 ? glyphs : undefined;
}

function findMatchingBrace(
    source: string,
    openOffset: number
): number {
    let depth = 0;

    for (let i = openOffset; i < source.length; i++) {
        if (source[i] === "{") {
            depth++;
        } else if (source[i] === "}") {
            depth--;

            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}

function parseArrayValues(source: string): number[] {
    const withoutComments = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

    const tokens = withoutComments.match(
        /0[xX][0-9a-fA-F]+|0[bB][01]+|\b\d+\b/g
    );

    if (!tokens) {
        return [];
    }

    return tokens.map(parseIntegerLiteral);
}

function parseIntegerLiteral(text: string): number {
    if (/^0[xX]/.test(text)) {
        return Number.parseInt(text.slice(2), 16);
    }

    if (/^0[bB]/.test(text)) {
        return Number.parseInt(text.slice(2), 2);
    }

    return Number.parseInt(text, 10);
}
