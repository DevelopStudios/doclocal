import { Component, ElementRef, HostListener, input, signal } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

export type ChipState = 'idle' | 'loading' | 'ready' | 'error';

@Component({
  selector: 'ui-status-chip',
  standalone: true,
  imports: [IconComponent],
  styles: [`
    .chip-wrapper { position: relative; display: inline-block; }
    .chip {
      display: flex; align-items: center; gap: 5px;
      padding: 4px 10px; border-radius: 999px;
      background: var(--color-surface); border: 1px solid var(--color-border);
      color: var(--color-text-muted); font-size: 11px; font-family: var(--font-mono);
      cursor: pointer;
    }
    .chip--ready { color: var(--color-accent); border-color: var(--color-accent-dim); }
    .chip--error { color: #f87171; border-color: rgba(248,113,113,0.2); }
    .popover {
      position: absolute; bottom: calc(100% + 8px); right: 0;
      background: var(--color-surface); border: 1px solid var(--color-border);
      border-radius: var(--radius-md); padding: 10px 14px; min-width: 200px;
      font-size: 12px; font-family: var(--font-mono);
      box-shadow: 0 8px 24px rgba(0,0,0,0.3); z-index: 100;
    }
    .popover-row {
      display: flex; justify-content: space-between; padding: 3px 0;
      color: var(--color-text-muted);
    }
    .popover-row span:last-child { color: var(--color-text); }
    .popover-error { color: #f87171; margin-top: 8px; font-size: 11px; }
  `],
  template: `
    <div class="chip-wrapper">
      <button class="chip" [class]="'chip--' + state()" (click)="togglePopover($event)">
        <ui-icon name="cpu" [size]="11" />
        @switch (state()) {
          @case ('idle')    { <span>local · WebGPU</span> }
          @case ('loading') { <span>loading · {{ (loadProgress() * 100).toFixed(0) }}%</span> }
          @case ('ready')   {
            <span>local · WebGPU{{ tokensPerSec() > 0 ? ' · ' + tokensPerSec() + ' tok/s' : '' }}</span>
          }
          @case ('error')   { <span>WebGPU unavailable</span> }
        }
      </button>
      @if (popoverOpen()) {
        <div class="popover">
          <div class="popover-row"><span>Runtime</span><span>100% local</span></div>
          <div class="popover-row"><span>Inference</span><span>WebGPU</span></div>
          @if (tokensPerSec() > 0) {
            <div class="popover-row"><span>Speed</span><span>{{ tokensPerSec() }} tok/s</span></div>
          }
          @if (errorMessage()) {
            <div class="popover-error">{{ errorMessage() }}</div>
          }
        </div>
      }
    </div>
  `,
})
export class StatusChipComponent {
  state = input<ChipState>('idle');
  tokensPerSec = input<number>(0);
  loadProgress = input<number>(0);
  errorMessage = input<string | null>(null);
  popoverOpen = signal(false);

  constructor(private el: ElementRef) {}

  togglePopover(e: MouseEvent) {
    e.stopPropagation();
    this.popoverOpen.update(v => !v);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent) {
    if (!this.el.nativeElement.contains(e.target)) {
      this.popoverOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.popoverOpen.set(false);
  }
}
