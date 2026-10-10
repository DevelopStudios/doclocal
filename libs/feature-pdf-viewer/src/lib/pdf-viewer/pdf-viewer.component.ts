import { getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfPageComponent } from './pdf-page.component';
import { Component, computed, input, output, inject, ElementRef, AfterViewInit, OnDestroy, effect, signal } from '@angular/core';
import type { PdfDocument, HighlightSpan } from '@doclocal/data-pdf';
import { buildParagraphs, type RenderedParagraph } from './highlight';
import { HeatMinimapComponent, type HeatResult } from '../heat-minimap/heat-minimap.component';

interface RenderedPage {
    pageNumber: number;
    paragraphs: RenderedParagraph[];
}

@Component({
    selector: 'pdf-viewer',
    standalone: true,
    imports: [PdfPageComponent, HeatMinimapComponent],
    styles: [`
      /* The document frame. The heat rail lives INSIDE it, sharing the frame's padding with
         the sheets, because it describes the document rather than the window -- out at the
         panel edge it read as a second scrollbar. */
      .pdf-frame {
        display: flex; gap: 10px; height: 100%; width: 100%;
        padding: 16px; overflow: hidden;
      }
      .pdf-scroll {
        flex: 1; min-width: 0; overflow-y: auto; height: 100%;
        display: flex; flex-direction: column; gap: 16px;
      }
      .pdf-page-block { flex-shrink: 0; }
      .pdf-page-number {
        font-size: var(--text-micro); font-family: var(--font-sans);
        color: var(--color-text-dim); margin-bottom: 6px; text-align: center;
        font-variant-numeric: var(--numeric-tabular);
      }
      /* One surface: the sheet. Nothing is painted around the rendered page, so there is no
         second tone framing it -- the card and the page it holds are the same thing. */
      .pdf-sheet {
        background: var(--color-paper); color: var(--color-ink);
        border-radius: var(--radius-md); overflow: hidden;
        box-shadow: 0 1px 4px rgb(0 0 0 / 0.12);
      }
      /* Only the text fallback needs inner padding; the rendered page carries its own margins. */
      .pdf-fallback-text {
        padding: 16px; font-family: var(--font-sans);
        font-size: var(--text-ui); line-height: var(--leading-body);
      }
      mark.highlight {
        background: var(--color-evidence-paper-wash); color: inherit;
        border-radius: 2px; padding: 0 2px;
      }
    `],
    template: `
      <div class="pdf-frame">
        <div class="pdf-scroll" #scrollEl>
          @if (renderError()) { <p role="alert">Could not render the PDF. Showing extracted text: {{ renderError() }}</p> }
          @for (page of renderedPages(); track page.pageNumber) {
            <div class="pdf-page-block" [attr.data-page]="page.pageNumber">
              <div class="pdf-page-number">{{ page.pageNumber }}</div>
              <div class="pdf-sheet">
                @if (doc().source && !renderError()) {
                  <pdf-page [pdf]="pdf()" [pageNumber]="page.pageNumber"
                    [size]="doc().pageSizes?.[page.pageNumber - 1] ?? defaultSize"
                    [cleanedText]="doc().pages[page.pageNumber - 1]"
                    [highlights]="pageHighlights(page.pageNumber)" />
                } @else {
                  <div class="pdf-fallback-text">
                    @for (para of page.paragraphs; track $index) {
                      @if (para.highlighted) {
                        <mark class="highlight" [attr.data-chunk-id]="para.chunkId">{{ para.text }}</mark>{{ para.trailing }}
                      } @else {
                        <span>{{ para.text }}</span>{{ para.trailing }}
                      }
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
        @if (ragResults().length) {
          <pdf-heat-minimap
            [pageCount]="doc().pageCount"
            [ragResults]="ragResults()"
            [activePage]="activePage()"
            (pageClicked)="pageClicked.emit($event)"
          />
        }
      </div>
    `,
})
export class PdfViewerComponent implements AfterViewInit, OnDestroy {
    private el = inject(ElementRef);
    private observer: IntersectionObserver | null = null;
    readonly pdf = signal<PDFDocumentProxy | null>(null);
    readonly renderError = signal<string | null>(null);
    readonly defaultSize = { width: 612, height: 792 };

    constructor() {
        effect(onCleanup => {
            const source = this.doc().source;
            this.pdf.set(null);
            this.renderError.set(null);
            if (!source) return;
            let active = true;
            const task = getDocument({ data: source.slice() });
            task.promise.then(pdf => { if (active) this.pdf.set(pdf); })
                .catch(error => { if (active) this.renderError.set(String(error)); });
            onCleanup(() => { active = false; void task.destroy(); });
        });
    }

    pageHighlights(page: number) {
        return this.highlights().filter(span => span.pageNumber === page);
    }

    doc = input.required<PdfDocument>();
    highlights = input<HighlightSpan[]>([]);
    /** Scored chunks behind the current answer. Drives the heat rail in the frame's gutter. */
    ragResults = input<HeatResult[]>([]);
    activePage = input<number>(0);
    pageVisible = output<number>();
    pageClicked = output<number>();

    renderedPages = computed<RenderedPage[]>(() => {
        const doc = this.doc();

        return doc.pages.map((pageText, i) => {
            const pageNumber = i + 1;
            const pageSpans = this.highlights().filter(s => s.pageNumber === pageNumber);
            const paragraphs = buildParagraphs(pageText, pageSpans);
            return { pageNumber, paragraphs };
        });
    });

    ngAfterViewInit() {
        const scroll = this.el.nativeElement.querySelector('.pdf-scroll');
        if (!scroll) return;

        const ratios = new Map<number, number>();

        this.observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                const page = parseInt(entry.target.getAttribute('data-page') ?? '1', 10);
                ratios.set(page, entry.intersectionRatio);
            }
            const best = [...ratios.entries()].sort((a, b) => b[1] - a[1])[0];
            if (best) this.pageVisible.emit(best[0]);
        }, { root: scroll, threshold: [0, 0.25, 0.5, 0.75, 1] });

        scroll.querySelectorAll('[data-page]').forEach((el: Element) => {
            this.observer?.observe(el);
        });
    }

    ngOnDestroy() {
        this.observer?.disconnect();
    }
}
