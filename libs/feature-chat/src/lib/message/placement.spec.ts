import { placePreview } from './placement';

const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height });

describe('placePreview', () => {
    const column = rect(200, 48, 460, 1000); // the chat column: x 200–660

    it('opens above the chip, left-aligned with it, when there is room', () => {
        expect(placePreview(rect(300, 600, 24, 16), column)).toEqual({ left: 300, top: 594, width: 320, above: true });
    });

    it('shifts left so a chip near the right edge keeps its preview inside the column', () => {
        const p = placePreview(rect(620, 600, 24, 16), column);
        expect(p.left + p.width).toBeLessThanOrEqual(column.right - 8);
        expect(p.left).toBe(660 - 8 - 320);
    });

    it('never starts left of the column', () => {
        expect(placePreview(rect(190, 600, 24, 16), column).left).toBe(208);
    });

    it('opens below the chip when it is too close to the top of the column', () => {
        expect(placePreview(rect(300, 90, 24, 16), column)).toMatchObject({ top: 112, above: false });
    });

    it('narrows the preview to fit a narrow column', () => {
        const narrow = rect(0, 0, 280, 800);
        const p = placePreview(rect(100, 400, 24, 16), narrow);
        expect(p.width).toBe(280 - 16);
        expect(p.left).toBe(8);
    });
});
