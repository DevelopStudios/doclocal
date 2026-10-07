import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
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
import { RequestAccessComponent } from '../request-access/request-access';

/** The sample the public demo asks about. Served from this app's own origin, so the
 * landing state costs no backend call; the backend indexed the same text at boot
 * (doclocal-backend app/demo/sample_document.json). */
const SAMPLE_PDF = 'aeration-retrofit-design-report.pdf';

/**
 * Everything a signed-in person works with: the document, its backend session and the
 * chat. It exists only while signed in, so signing out destroys it and the next person
 * starts from nothing -- the document, its chunks and the messages are all dropped, and
 * the backend session is deleted.
 */
@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    ChatPanelComponent,
    PdfViewerComponent,
    HeatMinimapComponent,
    UploadDropzoneComponent,
    RequestAccessComponent,
  ],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
})
export class Workspace implements OnInit, OnDestroy {
  private pdf = inject(PdfService);
  backend = inject(BackendService);

  /** Anonymous demo: one pinned document, no upload, replace or delete, and a route to
   * asking for an account once the visitor has seen it work. */
  demo = input<boolean>(false);

  doc = signal<PdfDocument | null>(null);
  highlights = signal<HighlightSpan[]>([]);
  ragResults = signal<HeatResult[]>([]);
  activePage = signal<number>(1);
  documentVersion = signal(0);
  private indexing = new Subscription();
  parsing = signal(false);
  parseError = signal<string | null>(null);
  /** Revealed only after the first answer, so a crawler would have to mint a session
   * and drive the chat to ever reach the address. */
  answered = signal(false);

  private beforeUnloadHandler = (): void => {
    this.backend.deleteSession$().subscribe({ error: () => undefined });
  };

  ngOnInit(): void {
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    if (this.demo()) void this.loadSample();
  }

  /** Parses the sample in the browser like any other document, but sends nothing: the
   * backend already holds an index of the same text. The chunks are still needed here
   * for the viewer's highlights. */
  private async loadSample(): Promise<void> {
    const version = this.documentVersion();
    this.parsing.set(true);
    try {
      const response = await fetch(SAMPLE_PDF, { cache: 'force-cache' });
      if (!response.ok) throw new Error(String(response.status));
      const file = new File([await response.blob()], SAMPLE_PDF, { type: 'application/pdf' });
      const parsed = await this.pdf.parse(file);
      if (version !== this.documentVersion()) return;
      this.doc.set(parsed);
      this.backend.useDemoDocument(parsed.chunks);
    } catch {
      if (version === this.documentVersion())
        this.parseError.set("Couldn't load the sample document. Reload the page to try again.");
    } finally {
      if (version === this.documentVersion()) this.parsing.set(false);
    }
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
