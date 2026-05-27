import { Component, computed, input, output } from '@angular/core';
  import type { RagResult } from '@doclocal/data-rag';
  
  interface PageHeat {
    pageNumber: number;
    score: number;
  }

  @Component({
    selector: 'pdf-heat-minimap',
    standalone: true,
    styles: [`
      .minimap {
        display: flex; flex-direction: column; gap: 3px;
        padding: 16px 4px; width: 14px; flex-shrink: 0;
      }
      .heat-strip {
        height: 16px; border-radius: 2px;
        background: var(--color-accent);
        cursor: pointer; transition: opacity 0.3s;
      }
      .heat-strip:hover { opacity: 1 !important; }
    `],
    template: `
      <div class="minimap">
        @for (page of heatMap(); track page.pageNumber) {
          <div
            class="heat-strip"
            [style.opacity]="0.1 + page.score * 0.9"
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
    ragResults = input<RagResult[]>([]);
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
