export interface PdfChunk {
    id: string;
    text: string;
    pageNumber: number;
  } 
  
  export interface PdfDocument {
    filename: string;
    pageCount: number;
    fileSize: number;
    pages: string[];
    chunks: PdfChunk[];
  } 