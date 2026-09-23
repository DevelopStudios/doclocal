 import { Component, computed, input, output, signal } from '@angular/core';
  import type { Message, Citation } from '../model';
  import { parseParts, type Part } from './parts';
  import { placePreview, type PreviewPlacement } from './placement';

  @Component({ 
    selector: 'chat-message',
    standalone: true,
    styles: [`
      .message { padding: 8px 0; }
      .bubble {
        display: inline-block; max-width: 82%;
        background: var(--color-surface); border-radius: var(--radius-md);
        padding: 10px 14px; font-size: 14px; line-height: 1.7;
      }
      .message--assistant .bubble { background: transparent; max-width: 100%; 
  padding-left: 0; }
      .cite-chip {
        position: relative; display: inline-block;
        background: var(--color-accent-dim); color: var(--color-accent);
        border-radius: 4px; padding: 0 4px; font-size: 11px;
        font-family: var(--font-mono); cursor: pointer; vertical-align: super;
      }
      /* Fixed so the chat column's scroll container can't clip it; placed by placePreview().
         Pointer-transparent, or a preview opened below a chip would cover (and "hover") the chips under it. */
      .cite-preview {
        position: fixed; z-index: 10; pointer-events: none;
        background: var(--color-surface); border: 1px solid var(--color-border);
        border-radius: var(--radius-md); padding: 10px 12px;
        font-family: var(--font-serif); font-size: 12px; line-height: 1.6;
        color: var(--color-text); white-space: normal;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      }
      .cite-preview--above { transform: translateY(-100%); }
      .cite-page {
        display: block; font-family: var(--font-mono); font-size: 10px;
        color: var(--color-text-muted); margin-bottom: 4px;
      }
      .cursor { animation: blink 1s step-end infinite; color: var(--color-accent); }
      @keyframes blink { 50% { opacity: 0; } }
    `],
    template: `
      <div class="message" [class]="'message--' + message().role">
        <div class="bubble">
          @for (part of parts(); track $index) {
            @if (part.type === 'text') {
              <span>{{ part.value }}</span>
            } @else {
              <span class="cite-chip" role="button" tabindex="0"
                    (click)="select(part.citation)"
                    (keydown.enter)="select(part.citation)"
                    (keydown.space)="$event.preventDefault(); select(part.citation)"
                    (mouseenter)="showPreview($index, $event)"
                    (mouseleave)="hovered.set(null)">
                {{ part.value }}
                @if (hovered() === $index && part.citation && placement(); as at) {
                  <span class="cite-preview" [class.cite-preview--above]="at.above"
                        [style.left.px]="at.left" [style.top.px]="at.top" [style.width.px]="at.width">
                    <span class="cite-page">p.{{ part.citation?.pageNumber }}</span>
                    "{{ part.citation?.text?.slice(0, 120) }}…"
                  </span>
                }
              </span>
            }
          }
          @if (message().streaming) {
            <span class="cursor">▋</span>
          }
        </div>
      </div>
    `,
  }) 
  export class MessageComponent {
    message = input.required<Message>();
    citationClicked = output<Citation>();
    /** Index of the hovered chip; several chips can cite the same excerpt. */
    hovered = signal<number | null>(null);
    placement = signal<PreviewPlacement | null>(null);

    showPreview(index: number, event: Event) {
      const chip = event.currentTarget as HTMLElement;
      const column = chip.closest('.messages') ?? document.body;
      this.placement.set(placePreview(chip.getBoundingClientRect(), column.getBoundingClientRect()));
      this.hovered.set(index);
    }

    select(citation: Citation | undefined) {
      if (citation) this.citationClicked.emit(citation);
    }

    parts = computed<Part[]>(() => {
      const { content, citations = [] } = this.message();
      return parseParts(content, citations);
    });
  }
