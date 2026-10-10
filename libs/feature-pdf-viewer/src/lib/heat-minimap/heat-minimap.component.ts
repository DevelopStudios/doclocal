import { Component, computed, input, output } from '@angular/core';
import type { PdfChunk } from '@doclocal/data-pdf';

/** A scored chunk. Declared here so the app need not depend on a retrieval implementation. */
export interface HeatResult {
  chunk: PdfChunk;
  score: number;
}

interface PageHeat {
  pageNumber: number;
  score: number;
}

/**
 * A narrow rail down the document showing which pages the current answer drew on.
 *
 * This is EVIDENCE, not chrome and not an interactive accent: it answers "where in this
 * document did that answer come from", so it is painted with --color-evidence over a
 * --color-evidence-wash track, the same family as the citation chips in the answer and the
 * highlight drawn on the page. The track spans the whole document so an unlit stretch reads
 * as "nothing here", and the opacity ramp separates a strong source page from a weak one.
 */
@Component({
  selector: 'pdf-heat-minimap',
  standalone: true,
  styles: [`
    :host { display: block; flex-shrink: 0; }
    .minimap {
      display: flex; flex-direction: column; gap: 2px;
      width: 6px; height: 100%; border-radius: 3px;
      background: var(--color-evidence-wash);
      overflow: hidden;
    }
    .heat-strip {
      /* Each page gets an equal share of the rail, so the rail maps to the document
         however long it is, instead of overflowing past a few dozen pages. */
      flex: 1 1 0; min-height: 3px;
      background: var(--color-evidence);
      cursor: pointer; transition: opacity 0.3s, outline 0.15s;
      outline: 1px solid transparent; outline-offset: -1px;
    }
    .heat-strip:hover { opacity: 1 !important; }
    .heat-strip.active {
      outline-color: var(--color-evidence);
      opacity: 1 !important;
    }
  `],
  template: `
    <div class="minimap">
      @for (page of heatMap(); track page.pageNumber) {
        <div
          class="heat-strip"
          [class.active]="page.pageNumber === activePage()"
          [style.opacity]="0.15 + page.score * 0.85"
          [title]="'Page ' + page.pageNumber"
          tabindex="0"
          role="button"
          (click)="pageClicked.emit(page.pageNumber)"
          (keydown.enter)="pageClicked.emit(page.pageNumber)"
          (keydown.space)="pageClicked.emit(page.pageNumber)"
        ></div>
      }
    </div>
  `,
})
export class HeatMinimapComponent {
  pageCount = input.required<number>();
  ragResults = input<HeatResult[]>([]);
  activePage = input<number>(0);
  pageClicked = output<number>();

  heatMap = computed<PageHeat[]>(() => {
    const scoreMap = new Map<number, number>();

    for (const r of this.ragResults()) {
      const existing = scoreMap.get(r.chunk.pageNumber) ?? 0;
      scoreMap.set(r.chunk.pageNumber, Math.max(existing, r.score));
    }

    return Array.from({ length: this.pageCount() }, (_, i) => ({
      pageNumber: i + 1,
      score: scoreMap.get(i + 1) ?? 0,
    }));
  });
}
