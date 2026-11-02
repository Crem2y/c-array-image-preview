import * as vscode from "vscode";

import { findPreviewArray } from "./previewParser";
import { render1bpp, renderRgb565, render1bppSheet } from "./previewRenderer";

export function activate(
    context: vscode.ExtensionContext
) {
    const provider =
        vscode.languages.registerHoverProvider(
            ["c", "cpp"],
            {
                provideHover(document, position) {
                    const hoverOffset =
                        document.offsetAt(position);

                    const preview = findPreviewArray(
                        document,
                        hoverOffset
                    );

                    if (!preview) {
                        return;
                    }

                    const {
                        metadata,
                        name
                    } = preview;
                    const glyphIndex = preview.glyphs?.findIndex(glyph =>
                        hoverOffset >= glyph.start && hoverOffset <= glyph.end
                    ) ?? -1;
                    const selectedGlyph = glyphIndex >= 0 ? preview.glyphs?.[glyphIndex] : undefined;
                    const values = selectedGlyph?.values ?? preview.values;
                    const title = selectedGlyph ? `${name}[${glyphIndex}]` : name;

                    const requiredLength =
                        metadata.type === "rgb565"
                            ? metadata.width * metadata.height * 2
                            : metadata.packing === "unpacked"
                            ? metadata.width * metadata.height
                            : metadata.layout === "horizontal"
                            ? Math.ceil(metadata.width / 8) *
                            metadata.height
                            : metadata.width *
                            Math.ceil(metadata.height / 8);

                    if (values.length < requiredLength) {
                        const md = new vscode.MarkdownString();

                        md.appendMarkdown(`### ${name}\n\n`);
                        md.appendMarkdown(
                            `Not enough data: ` +
                            `${values.length}/${requiredLength} ` +
                            (metadata.packing === "unpacked" ? "pixels" : "bytes")
                        );

                        return new vscode.Hover(md);
                    }

                    if (metadata.type === "rgb565" && values.some(value =>
                        !Number.isInteger(value) || value < 0 || value > 255
                    )) {
                        return new vscode.Hover("RGB565 requires 8-bit array elements (0–255).");
                    }

                    const base64 = preview.glyphs && !selectedGlyph
                        ? render1bppSheet(preview.glyphs.map(glyph => glyph.values), metadata)
                        : metadata.type === "rgb565"
                        ? renderRgb565(values, metadata.width, metadata.height, metadata.layout)
                        : render1bpp(
                        values,
                        metadata.width,
                        metadata.height,
                        metadata.layout,
                        metadata.packing,
                        metadata.bitOrder
                    );

                    const md =
                        new vscode.MarkdownString();

                    md.appendMarkdown(
                        `### ${title}\n\n`
                    );

                    md.appendMarkdown(
                        `${metadata.width} x ` +
                        `${metadata.height} · ` +
                        `${metadata.type}\n\n`
                    );
                    if (preview.glyphs && !selectedGlyph) {
                        md.appendMarkdown(`${preview.glyphs.length} glyphs · ${metadata.sheet?.columns} columns\n\n`);
                    }

                    md.appendMarkdown(
                        `![](data:image/png;base64,${base64})`
                    );

                    return new vscode.Hover(md);
                }
            }
        );

    context.subscriptions.push(provider);
}

export function deactivate() {}
