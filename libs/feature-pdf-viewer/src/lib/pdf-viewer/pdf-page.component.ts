import { AfterViewInit, Component, ElementRef, OnDestroy, effect, inject, input, signal, viewChild } from '@angular/core';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { HighlightSpan } from '@doclocal/data-pdf';
import { textRanges } from './text-ranges';

@Component({
  selector: 'pdf-page',
  standalone: true,
  styleUrl: './pdf-page.component.scss',
  template: `
    <div class="page-surface" #surface [style.aspect-ratio]="size().width + ' / ' + size().height"
      [attr.aria-label]="'PDF page ' + pageNumber()" [attr.aria-busy]="!rendered() && !error()">
      <div #layers class="page-layers"></div>
      @if (error()) {
        <div class="page-status" role="alert">Could not render this page: {{ error() }}
          <button type="button" (click)="render()">Retry</button>
        </div>
      } @else if (!rendered()) {
        <div class="page-status">Page {{ pageNumber() }}</div>
      }
    </div>
  `,
})
export class PdfPageComponent implements AfterViewInit, OnDestroy {
  pdf = input<PDFDocumentProxy | null>(null);
  pageNumber = input.required<number>();
  size = input.required<{ width: number; height: number }>();
  cleanedText = input.required<string>();
  highlights = input<HighlightSpan[]>([]);
  rendered = signal(false);
  error = signal<string | null>(null);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private surface = viewChild.required<ElementRef<HTMLElement>>('surface');
  private layers = viewChild.required<ElementRef<HTMLElement>>('layers');
  private observer?: IntersectionObserver;
  private resize?: ResizeObserver;
  private active = false;
  private width = 0;
  private version = 0;
  private destroyed = false;
  private task?: RenderTask;
  private textLayer?: TextLayer;
  private overlay?: HTMLElement;

  constructor() {
    effect(() => {
      this.pdf();
      if (this.active) void this.render();
    });
    effect(() => {
      const spans = this.highlights();
      if (this.rendered()) this.paintHighlights(spans);
    });
  }

  ngAfterViewInit() {
    this.observer = new IntersectionObserver(entries => {
      const active = entries.some(entry => entry.isIntersecting);
      if (active === this.active) return;
      this.active = active;
      if (active) void this.render(); else this.release();
    }, { root: this.host.nativeElement.closest('.pdf-scroll'), rootMargin: '400px 0px' });
    this.observer.observe(this.host.nativeElement);
    this.resize = new ResizeObserver(entries => {
      const width = Math.floor(entries[0].contentRect.width);
      if (width === this.width) return;
      this.width = width;
      if (this.active) void this.render();
    });
    this.resize.observe(this.surface().nativeElement);
  }

  private release() {
    this.version++;
    this.task?.cancel();
    this.task = undefined;
    this.textLayer?.cancel();
    this.textLayer = undefined;
    this.overlay = undefined;
    this.layers().nativeElement.querySelectorAll('canvas').forEach(canvas => { canvas.width = canvas.height = 0; });
    this.layers().nativeElement.replaceChildren();
    this.rendered.set(false);
  }

  async render() {
    this.release();
    this.error.set(null);
    const pdf = this.pdf();
    if (!pdf || !this.active || this.destroyed) return;
    const version = this.version;
    const current = () => version === this.version && !this.destroyed;
    try {
      const page = await pdf.getPage(this.pageNumber());
      if (!current()) return;
      const width = this.surface().nativeElement.clientWidth;
      if (width <= 0) return;
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / natural.width });
      // Bound backing-store memory on high-DPI screens and unusually large pages.
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4_000_000 / (viewport.width * viewport.height)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.setAttribute('aria-hidden', 'true');
      const text = document.createElement('div');
      text.className = 'pdf-text-layer';
      text.style.setProperty('--total-scale-factor', String(viewport.scale * viewport.userUnit));
      const overlay = document.createElement('div');
      overlay.className = 'pdf-highlight-layer';
      overlay.setAttribute('aria-hidden', 'true');
      this.layers().nativeElement.replaceChildren(canvas, text, overlay);
      this.overlay = overlay;
      this.task = page.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await this.task.promise;
      if (!current()) return;
      this.task = undefined;
      const content = await page.getTextContent();
      if (!current()) return;
      this.textLayer = new TextLayer({ textContentSource: content, container: text, viewport });
      await this.textLayer.render();
      if (!current()) return;
      this.rendered.set(true);
      this.paintHighlights(this.highlights());
    } catch (error) {
      if (current()) this.error.set(error instanceof Error ? error.message : String(error));
    }
  }

  private paintHighlights(spans: HighlightSpan[]) {
    const layer = this.textLayer;
    const overlay = this.overlay;
    if (!layer || !overlay) return;
    overlay.replaceChildren();
    const box = this.surface().nativeElement.getBoundingClientRect();
    const ranges = textRanges(layer.textContentItemsStr, this.cleanedText(), spans);
    for (const mapped of ranges) {
      const node = layer.textDivs[mapped.item]?.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      const range = document.createRange();
      range.setStart(node, mapped.start);
      range.setEnd(node, mapped.end);
      for (const rect of Array.from(range.getClientRects())) {
        const mark = document.createElement('div');
        mark.className = 'citation-highlight';
        mark.dataset['chunkId'] = mapped.chunkId;
        mark.style.left = `${rect.left - box.left}px`;
        mark.style.top = `${rect.top - box.top}px`;
        mark.style.width = `${rect.width}px`;
        mark.style.height = `${rect.height}px`;
        overlay.append(mark);
      }
    }
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.observer?.disconnect();
    this.resize?.disconnect();
    this.release();
  }
}
