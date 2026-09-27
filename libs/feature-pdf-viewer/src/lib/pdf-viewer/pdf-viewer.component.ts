import { getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfPageComponent } from './pdf-page.component';
import { Component, computed, input, output, inject, ElementRef, AfterViewInit, OnDestroy, effect, signal } from '@angular/core';
import type { PdfDocument, HighlightSpan } from '@doclocal/data-pdf';
import { buildParagraphs, type RenderedParagraph } from './highlight';

interface RenderedPage {
    pageNumber: number;
    paragraphs: RenderedParagraph[];
}

@Component({
    selector: 'pdf-viewer',
    standalone: true,
    imports: [PdfPageComponent],
    styles: [`
      .pdf-scroll {
        overflow-y: auto; height: 100%; padding: 16px;
        display: flex; flex-direction: column; gap: 16px;
      }
      .pdf-page {
        background: var(--color-pdf-bg); color: var(--color-pdf-text);
        border-radius: var(--radius-md); padding: 12px; flex-shrink: 0;
        font-family: var(--font-serif); font-size: 14px; line-height: 1.8;
        box-shadow: 0 1px 4px rgba(0,0,0,0.12);
      }
      .pdf-page-number {
        font-size: 10px; font-family: var(--font-mono); color: #999;
        margin-bottom: 16px; text-align: center;
      }
      mark.highlight {
        background: var(--color-highlight); color: inherit;
        border-radius: 2px; padding: 0 2px;
      }
    `],
    template: `
      <div class="pdf-scroll" #scrollEl>
        @if (renderError()) { <p role="alert">Could not render the PDF. Showing extracted text: {{ renderError() }}</p> }
        @for (page of renderedPages(); track page.pageNumber) {
          <div class="pdf-page" [attr.data-page]="page.pageNumber">
            <div class="pdf-page-number">{{ page.pageNumber }}</div>
            @if (doc().source && !renderError()) {
              <pdf-page [pdf]="pdf()" [pageNumber]="page.pageNumber"
                [size]="doc().pageSizes?.[page.pageNumber - 1] ?? defaultSize"
                [cleanedText]="doc().pages[page.pageNumber - 1]"
                [highlights]="pageHighlights(page.pageNumber)" />
            } @else {
            @for (para of page.paragraphs; track $index) {
              @if (para.highlighted) {
                <mark class="highlight" [attr.data-chunk-id]="para.chunkId">{{ para.text }}</mark>{{ para.trailing }}
              } @else {
                <span>{{ para.text }}</span>{{ para.trailing }}
              }
            }
            }
          </div>
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
    pageVisible = output<number>();

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
