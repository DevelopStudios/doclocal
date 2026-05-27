  import { Injectable } from '@angular/core';
  import * as pdfjsLib from 'pdfjs-dist';
  import type { PdfDocument } from './models';
  import { chunkPages } from './chunking';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

@Injectable({ providedIn: 'root' })
  export class PdfService {
    async parse(file: File): Promise<PdfDocument> {
      const buffer = await file.arrayBuffer();
      const pages = await this.extractPages(buffer);
      const chunks = chunkPages(pages);

      return {
        filename: file.name,
        fileSize: file.size,
        pageCount: pages.length,
        pages,
        chunks,
      };
    }
    
    private async extractPages(buffer: ArrayBuffer): Promise<string[]> {
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const pages: string[] = [];
  
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(
          content.items
            .map((item: any) => ('str' in item ? item.str : ''))
            .join(' ')
        );
      }
  
      return pages;
    }

}