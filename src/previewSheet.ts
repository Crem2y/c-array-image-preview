export function getSheetSize(width: number, height: number, count: number, columns: number) {
    if (![width, height, count, columns].every(value => Number.isSafeInteger(value) && value > 0)) {
        return;
    }
    const usedColumns = Math.min(count, columns);
    const rows = Math.ceil(count / usedColumns);
    const sheetWidth = usedColumns * width;
    const sheetHeight = rows * height;
    if (sheetWidth * sheetHeight > 1024 * 1024) {
        return;
    }
    return { width: sheetWidth, height: sheetHeight, columns: usedColumns };
}
