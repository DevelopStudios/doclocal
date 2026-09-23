 import { Component, computed, input, output, signal } from '@angular/core';
  import type { Message, Citation } from '../model';
  import { parseParts, type Part } from './parts';

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
      .cite-preview { 
        position: absolute; bottom: calc(100% + 6px); left: 0;
        background: var(--color-surface); border: 1px solid var(--color-border);
        border-radius: var(--radius-md); padding: 10px 12px;
        min-width: 240px; max-width: 320px; width: max-content;
        font-family: var(--font-serif); font-size: 12px; line-height: 1.6;
        color: var(--color-text); z-index: 10;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      }
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
                    (mouseenter)="hovered.set($index)"
                    (mouseleave)="hovered.set(null)">
                {{ part.value }}
                @if (hovered() === $index && part.citation) {
                  <span class="cite-preview">
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

    select(citation: Citation | undefined) {
      if (citation) this.citationClicked.emit(citation);
    }

    parts = computed<Part[]>(() => {
      const { content, citations = [] } = this.message();
      return parseParts(content, citations);
    });
  }
