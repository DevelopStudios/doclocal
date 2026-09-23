export interface PdfChunk {
    id: string;
    text: string;
    pageNumber: number;
    /** Index of the chunk's first word within its page's whitespace-split words. */
    startWord: number;
  } 
  
  /** A run of words on one page to highlight: `startWord` inclusive, `endWord` exclusive. */
  export interface HighlightSpan {
    chunkId: string;
    pageNumber: number;
    startWord: number;
    endWord: number;
  }

  export interface PdfDocument {
    filename: string;
    pageCount: number;
    fileSize: number;
    pages: string[];
    chunks: PdfChunk[];
  } 