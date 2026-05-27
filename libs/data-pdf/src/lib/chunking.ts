 import { PdfChunk } from './models';
 export function chunkPages(pages: string[], chunkSize = 512, overlap = 64): PdfChunk[]
  {
    const chunks: PdfChunk[] = [];
    let chunkIndex = 0;
    
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const words = pages[pageIndex].split(/\s+/).filter(Boolean); 
      if (words.length === 0) continue;
      
      let i = 0;
      while (i < words.length) {
        chunks.push({
          id: `chunk-${chunkIndex++}`,
          text: words.slice(i, i + chunkSize).join(' '),
          pageNumber: pageIndex + 1,
        });
        i += chunkSize - overlap;
      } 
    } 
    
    return chunks;
  }