 export interface Citation {
    chunkId: string;
    text: string;
    pageNumber: number;
    score: number;
  }

  export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    citations?: Citation[];
    streaming?: boolean;
  }