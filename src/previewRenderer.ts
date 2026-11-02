import { PNG } from "pngjs";
import { PreviewLayout, PreviewPacking, PreviewBitOrder, PreviewMetadata } from "./previewTypes";
import { getSheetSize } from "./previewSheet";

const MAX_PREVIEW_SCALE = 4;
const TARGET_PREVIEW_SIZE = 256;

function getPreviewScale(width: number, height: number): number {
    return Math.max(1, Math.min(
        MAX_PREVIEW_SCALE,
        Math.floor(TARGET_PREVIEW_SIZE / Math.max(width, height))
    ));
}

export function render1bpp(
    values: number[],
    width: number,
    height: number,
    layout: PreviewLayout,
    packing: PreviewPacking = "packed",
    bitOrder: PreviewBitOrder = "msb"
): string {
    const scale = getPreviewScale(width, height);
    const outputWidth = width * scale;
    const outputHeight = height * scale;

    const png = new PNG({
        width: outputWidth,
        height: outputHeight
    });

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const bit = packing === "unpacked"
                ? (values[layout === "horizontal" ? y * width + x : x * height + y] ?? 0)
                : layout === "horizontal"
                ? getHorizontalBit(values, width, x, y, bitOrder)
                : getVerticalBit(values, height, x, y, bitOrder);

            const color = bit === 0 ? 255 : 0;

            drawScaledPixel(
                png,
                x,
                y,
                scale,
                color
            );
        }
    }

    return PNG.sync.write(png).toString("base64");
}

export function render1bppSheet(glyphs: number[][], metadata: PreviewMetadata): string {
    const size = metadata.sheet && getSheetSize(
        metadata.width, metadata.height, glyphs.length, metadata.sheet.columns
    );
    if (!size) { throw new Error("Invalid or oversized font sheet"); }
    const scale = getPreviewScale(size.width, size.height);
    const png = new PNG({ width: size.width * scale, height: size.height * scale });
    // Blank glyphs and unused cells are opaque white.
    png.data.fill(255);
    glyphs.forEach((values, index) => {
        const originX = (index % size.columns) * metadata.width;
        const originY = Math.floor(index / size.columns) * metadata.height;
        for (let y = 0; y < metadata.height; y++) {
            for (let x = 0; x < metadata.width; x++) {
                const bit = metadata.layout === "horizontal"
                    ? getHorizontalBit(values, metadata.width, x, y, metadata.bitOrder)
                    : getVerticalBit(values, metadata.height, x, y, metadata.bitOrder);
                drawScaledPixel(png, originX + x, originY + y, scale, bit ? 0 : 255);
            }
        }
    });
    return PNG.sync.write(png).toString("base64");
}

export function renderRgb565(
    values: number[],
    width: number,
    height: number,
    layout: PreviewLayout
): string {
    const scale = getPreviewScale(width, height);
    const png = new PNG({
        width: width * scale,
        height: height * scale
    });

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixelIndex = layout === "horizontal" ? y * width + x : x * height + y;
            const byteIndex = pixelIndex * 2;
            const pixel = values[byteIndex] | (values[byteIndex + 1] << 8);
            const red = (pixel >> 11) & 0x1f;
            const green = (pixel >> 5) & 0x3f;
            const blue = pixel & 0x1f;

            drawScaledPixel(
                png, x, y, scale,
                (red << 3) | (red >> 2),
                (green << 2) | (green >> 4),
                (blue << 3) | (blue >> 2)
            );
        }
    }

    return PNG.sync.write(png).toString("base64");
}

function drawScaledPixel(
    png: PNG,
    sourceX: number,
    sourceY: number,
    scale: number,
    red: number,
    green: number = red,
    blue: number = red
): void {
    const startX = sourceX * scale;
    const startY = sourceY * scale;

    for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
            const outputX = startX + dx;
            const outputY = startY + dy;

            const outputIndex =
                (outputY * png.width + outputX) * 4;

            png.data[outputIndex + 0] = red;
            png.data[outputIndex + 1] = green;
            png.data[outputIndex + 2] = blue;
            png.data[outputIndex + 3] = 255;
        }
    }
}

function getHorizontalBit(
    values: number[],
    width: number,
    x: number,
    y: number,
    bitOrder: PreviewBitOrder
): number {
    const bytesPerRow = Math.ceil(width / 8);

    const byteIndex =
        y * bytesPerRow + Math.floor(x / 8);

    const bitIndex = bitOrder === "lsb" ? x % 8 : 7 - (x % 8);

    return ((values[byteIndex] ?? 0) >> bitIndex) & 1;
}

function getVerticalBit(
    values: number[],
    height: number,
    x: number,
    y: number,
    bitOrder: PreviewBitOrder
): number {
    const bytesPerColumn = Math.ceil(height / 8);

    const byteIndex =
        x * bytesPerColumn + Math.floor(y / 8);

    const bitIndex = bitOrder === "lsb" ? y % 8 : 7 - (y % 8);

    return ((values[byteIndex] ?? 0) >> bitIndex) & 1;
}
