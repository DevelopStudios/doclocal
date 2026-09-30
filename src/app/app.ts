import { Component, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { PdfService } from '@doclocal/data-pdf';
import type { HighlightSpan, PdfDocument } from '@doclocal/data-pdf';
import { BackendService } from '@doclocal/data-backend';
import { ChatPanelComponent } from '@doclocal/feature-chat';
import type { HeatResult } from '@doclocal/feature-pdf-viewer';
import {
  HeatMinimapComponent,
  PdfViewerComponent,
  UploadDropzoneComponent,
} from '@doclocal/feature-pdf-viewer';

type Theme = 'dark' | 'light' | 'mono';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ChatPanelComponent, PdfViewerComponent, HeatMinimapComponent, UploadDropzoneComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  private pdf = inject(PdfService);
  backend = inject(BackendService);

  theme = signal<Theme>('dark');
  doc = signal<PdfDocument | null>(null);
  highlights = signal<HighlightSpan[]>([]);
  ragResults = signal<HeatResult[]>([]);
  activePage = signal<number>(1);
  documentVersion = signal(0);
  private indexing = new Subscription();
  parsing = signal(false);
  parseError = signal<string | null>(null);

  readonly themes: Theme[] = ['dark', 'light', 'mono'];

  private beforeUnloadHandler = (): void => {
    this.backend.deleteSession$().subscribe({ error: () => undefined });
  };

  constructor() {
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.theme());
    });
  }

  ngOnInit(): void {
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    this.indexing.unsubscribe();
    this.documentVersion.update((v) => v + 1);
    this.backend.deleteSession$().subscribe({ error: () => undefined });
  }

  replaceDocument(): void {
    this.documentVersion.update((v) => v + 1);
    this.indexing.unsubscribe();
    this.parsing.set(false);
    this.parseError.set(null);
    this.backend.deleteSession$().subscribe({
      error: () =>
        this.parseError.set('Server cleanup failed. The session will expire automatically.'),
    });
    this.doc.set(null);
    this.highlights.set([]);
    this.ragResults.set([]);
    this.activePage.set(1);
  }

  async onFileSelected(file: File): Promise<void> {
    this.replaceDocument();
    const version = this.documentVersion();
    this.parsing.set(true);

    try {
      // Parsing stays in the browser; only the extracted chunks are sent for indexing.
      const parsed = await this.pdf.parse(file);
      if (version !== this.documentVersion()) return;
      this.doc.set(parsed);
      // Progress and failures are shown next to the composer from backend.sessionStatus().
      this.indexing = this.backend
        .indexDocument$(parsed.chunks)
        .subscribe({ error: () => undefined });
    } catch (e) {
      if (version === this.documentVersion()) this.parseError.set((e as Error).message);
    } finally {
      if (version === this.documentVersion()) this.parsing.set(false);
    }
  }

  onCitationsChanged(spans: HighlightSpan[]): void {
    this.highlights.set(spans);
    const chunkIds = [...new Set(spans.map((s) => s.chunkId))];
    const results = chunkIds
      .map((id) => {
        const chunk = this.doc()?.chunks.find((c) => c.id === id);
        return chunk ? { chunk, score: 1 } : null;
      })
      .filter(Boolean) as HeatResult[];
    this.ragResults.set(results);

    if (spans.length > 0) {
      this.onPageClicked(spans[0].pageNumber);
    }
  }

  onPageClicked(pageNumber: number): void {
    document.querySelector(`[data-page="${pageNumber}"]`)?.scrollIntoView({ behavior: 'smooth' });
  }
}
