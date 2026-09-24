 export interface Citation {
    chunkId: string;
    text: string;
    pageNumber: number;
    startWord: number;
    score: number;
  }

  export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    citations?: Citation[];
    streaming?: boolean;
    /** What an assistant message is doing before its first token, e.g. "Searching document…". */
    stage?: string;
  }