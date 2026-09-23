import { Component, effect, inject, OnInit, signal } from '@angular/core';
  import { PdfService } from '@doclocal/data-pdf';
  import type { PdfDocument, HighlightSpan } from '@doclocal/data-pdf';
  import { RagService } from '@doclocal/data-rag';
  import type { RagResult } from '@doclocal/data-rag';
  import { LlmService } from '@doclocal/data-webllm';
  import { ChatPanelComponent } from '@doclocal/feature-chat';
  import { HeatMinimapComponent, PdfViewerComponent, UploadDropzoneComponent } from
  '@doclocal/feature-pdf-viewer';
  
  type Theme = 'dark' | 'light' | 'mono';
  
  @Component({
    selector: 'app-root',
    standalone: true,
    imports: [ChatPanelComponent, PdfViewerComponent, HeatMinimapComponent,
  UploadDropzoneComponent],
    templateUrl: './app.html',  
    styleUrl: './app.scss',                                       
  })
  export class App implements OnInit {
    private pdf = inject(PdfService);
    rag = inject(RagService);
    llm = inject(LlmService);   
                                                                  
    theme = signal<Theme>('dark');
    doc = signal<PdfDocument | null>(null);
    highlights = signal<HighlightSpan[]>([]);
    ragResults = signal<RagResult[]>([]);
    activePage = signal<number>(1);
    parsing = signal(false);
    parseError = signal<string | null>(null);
  
    readonly themes: Theme[] = ['dark', 'light', 'mono'];
  
    constructor() {
      effect(() => {
        document.documentElement.setAttribute('data-theme', this.theme());
      });
    }

    ngOnInit() {
      this.llm.load();
    }

    async onFileSelected(file: File) {
      this.parsing.set(true);   
      this.parseError.set(null);                 
      this.doc.set(null);
      this.highlights.set([]);
      this.ragResults.set([]);
  
      try {                                      
        const parsed = await this.pdf.parse(file);
        this.doc.set(parsed);
        this.rag.buildIndex$(parsed.chunks).subscribe({
          error: (err) => this.parseError.set(err.message),
        }); 
      } catch (e) {                                               
        this.parseError.set((e as Error).message);
      } finally {
        this.parsing.set(false);
      }
    }

    onCitationsChanged(spans: HighlightSpan[]) {
      this.highlights.set(spans);
      const chunkIds = [...new Set(spans.map(s => s.chunkId))];
      const results = chunkIds.map(id => {
        const chunk = this.doc()?.chunks.find(c => c.id === id);
        return chunk ? { chunk, score: 1 } : null;
      }).filter(Boolean) as RagResult[];
      this.ragResults.set(results);

      if (spans.length > 0) {
        this.onPageClicked(spans[0].pageNumber);
      }
    }

    onPageClicked(pageNumber: number) {
      document.querySelector(`[data-page="${pageNumber}"]`)
        ?.scrollIntoView({ behavior: 'smooth' });
    }
  }