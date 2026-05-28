import { Component, computed, input, output, inject, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import type { PdfDocument, PdfChunk } from '@doclocal/data-pdf';

interface RenderedParagraph {
    chunkId: string | null;
    text: string;
    highlighted: boolean;
}

interface RenderedPage {
    pageNumber: number;
    paragraphs: RenderedParagraph[];
}

@Component({
    selector: 'pdf-viewer',
    standalone: true,
    styles: [`
      .pdf-scroll {
        overflow-y: auto; height: 100%; padding: 16px;
        display: flex; flex-direction: column; gap: 16px;
      }
      .pdf-page {
        background: var(--color-pdf-bg); color: var(--color-pdf-text);
        border-radius: var(--radius-md); padding: 32px;
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
        @for (page of renderedPages(); track page.pageNumber) {
          <div class="pdf-page" [attr.data-page]="page.pageNumber">
            <div class="pdf-page-number">{{ page.pageNumber }}</div>
            @for (para of page.paragraphs; track $index) {
              @if (para.highlighted) {
                <mark class="highlight" [attr.data-chunk-id]="para.chunkId">{{ para.text }} </mark>
              } @else {
                <span>{{ para.text }} </span>
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

    doc = input.required<PdfDocument>();
    highlightedChunkIds = input<string[]>([]);
    pageVisible = output<number>();

    renderedPages = computed<RenderedPage[]>(() => {
        const doc = this.doc();
        const highlighted = new Set(this.highlightedChunkIds());

        return doc.pages.map((pageText, i) => {
            const pageNumber = i + 1;
            const pageChunks = doc.chunks.filter(c => c.pageNumber === pageNumber);
            const paragraphs = this.buildParagraphs(pageText, pageChunks, highlighted);
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
            this.observer!.observe(el);
        });
    }

    ngOnDestroy() {
        this.observer?.disconnect();
    }

    private buildParagraphs(
        pageText: string,
        chunks: PdfChunk[],
        highlighted: Set<string>
    ): RenderedParagraph[] {
        const paragraphs: RenderedParagraph[] = [];
        let remaining = pageText;

        for (const chunk of chunks) {
            const probe = chunk.text.slice(0, 40);
            const idx = remaining.indexOf(probe);

            if (idx > 0) {
                paragraphs.push({ chunkId: null, text: remaining.slice(0, idx), highlighted: false });
                remaining = remaining.slice(idx);
            }

            if (remaining.startsWith(probe)) {
                paragraphs.push({
                    chunkId: chunk.id,
                    text: chunk.text,
                    highlighted: highlighted.has(chunk.id),
                });
                remaining = remaining.slice(chunk.text.length).trimStart();
            }
        }

        if (remaining.trim()) {
            paragraphs.push({ chunkId: null, text: remaining, highlighted: false });
        }

        return paragraphs;
    }
}
