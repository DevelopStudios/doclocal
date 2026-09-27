import './promise-try';
import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import type { PdfDocument } from './models';
import { chunkPages } from './chunking';
import { stripRepeatedText } from './boilerplate';
import { pageText } from './page-text';

// The build copies the matching worker into the app; no third-party request is needed.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

@Injectable({ providedIn: 'root' })
export class PdfService {
  async parse(file: File): Promise<PdfDocument> {
    const source = new Uint8Array(await file.arrayBuffer());
    // pdf.js transfers its input to a worker; retain the original for the viewer.
    const loading = pdfjsLib.getDocument({ data: source.slice() });
    try {
      const pdf = await loading.promise;
      const rawPages: string[] = [];
      const pageSizes: { width: number; height: number }[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        pageSizes.push({ width: viewport.width, height: viewport.height });
        rawPages.push(pageText((await page.getTextContent()).items));
        page.cleanup();
      }
      const pages = stripRepeatedText(rawPages);
      return { filename: file.name, fileSize: file.size, pageCount: pages.length,
        pages, chunks: chunkPages(pages), source, pageSizes };
    } finally {
      await loading.destroy();
    }
  }
}
