 import { Component, computed, input, signal } from '@angular/core';
  import type { Message, Citation } from '../model';
  
  interface TextPart { type: 'text'; value: string; }
  interface CitePart { type: 'cite'; value: string; citation: Citation | undefined; }
  type Part = TextPart | CitePart;

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
        font-family: var(--font-mono); cursor: default; vertical-align: super;
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
              <span class="cite-chip"
                    (mouseenter)="hovered.set(part.citation ?? null)"
                    (mouseleave)="hovered.set(null)">
                {{ part.value }}
                @if (hovered() && hovered()?.chunkId === part.citation?.chunkId) {
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
    hovered = signal<Citation | null>(null);

    parts = computed<Part[]>(() => {
      const { content, citations = [] } = this.message();
      const result: Part[] = [];
      const regex = /\[(\d+)\]/g;
      let last = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        if (match.index > last) {
          result.push({ type: 'text', value: content.slice(last, match.index) });
        }   
        result.push({
          type: 'cite',
          value: match[0],
          citation: citations[parseInt(match[1], 10) - 1],
        }); 
        last = match.index + match[0].length;
      }

      if (last < content.length) {
        result.push({ type: 'text', value: content.slice(last) });
      }
  
      return result;
    });
  }
