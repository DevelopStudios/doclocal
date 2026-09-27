import { getDocument } from 'pdfjs-dist';
import { PdfService } from './pdf.service';

jest.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: jest.fn() }));

function fixture(failure?: Error) {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const file = new File([bytes], 'source.pdf');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.slice().buffer });
  const destroy = jest.fn(async () => undefined);
  const pdf = {
    numPages: 2,
    getPage: jest.fn(async (n: number) => ({
      getViewport: () => n === 1 ? { width: 400, height: 240 } : { width: 240, height: 400 },
      getTextContent: async () => {
        if (failure) throw failure;
        return { items: [{ str: n === 1 ? 'First page' : 'Second page', hasEOL: false }] };
      },
      cleanup: jest.fn(),
    })),
  };
  (getDocument as jest.Mock).mockImplementation(({ data }: { data: Uint8Array }) => {
    // The worker owns its input. Mutating it must not change the retained original.
    data.fill(0);
    return { promise: Promise.resolve(pdf), destroy };
  });
  return { file, destroy };
}

describe('PdfService rendering data', () => {
  it('retains source bytes and rotated page dimensions alongside cleaned retrieval text', async () => {
    const { file, destroy } = fixture();
    const doc = await new PdfService().parse(file);
    expect(Array.from(doc.source ?? [])).toEqual([1, 2, 3, 4]);
    expect(doc.pageSizes).toEqual([{ width: 400, height: 240 }, { width: 240, height: 400 }]);
    expect(doc.pages).toEqual(['First page', 'Second page']);
    expect(doc.chunks.map(chunk => chunk.text)).toEqual(['First page', 'Second page']);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('releases the parsing worker when text extraction fails', async () => {
    const error = new Error('Malformed page');
    const { file, destroy } = fixture(error);
    await expect(new PdfService().parse(file)).rejects.toBe(error);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('releases a loading task whose document never opens', async () => {
    const { file, destroy } = fixture();
    (getDocument as jest.Mock).mockReturnValue({ promise: Promise.reject(new Error('Invalid PDF')), destroy });
    await expect(new PdfService().parse(file)).rejects.toThrow('Invalid PDF');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
