import { Component, inject, input, output, signal } from '@angular/core';
import { of } from 'rxjs';
import { RagService } from '@doclocal/data-rag';
import { LlmService } from '@doclocal/data-webllm';
import { StatusChipComponent } from '@doclocal/ui-kit';
import { MessageComponent } from '../message/message.component';
import { ComposerComponent } from '../composer/composer.component';
import type { Message, Citation } from '../model';
import type { HighlightSpan } from '@doclocal/data-pdf';
import { citedSpans, repairCitations, spansForCitation } from './citations';
import { buildPrompt } from './prompt';
import { isOverviewQuestion } from './question-kind';

@Component({
  selector: 'chat-panel',
  standalone: true,
  imports: [MessageComponent, ComposerComponent, StatusChipComponent],
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; }
    .messages { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 16px; display: flex;
      flex-direction: column; gap: 4px; }
    .suggested { display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
      padding: 0 16px 8px; }
    .suggested-label {
      font-size: 11px; font-family: var(--font-mono); color: var(--color-text-muted);
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .suggested-item {
      background: var(--color-surface); border: 1px solid var(--color-border);
      border-radius: 999px; padding: 4px 12px; font-size: 12px;
      color: var(--color-text-muted); cursor: pointer; transition: border-color 0.15s, color 0.15s;
    }
    .suggested-item:hover { border-color: var(--color-accent); color: var(--color-text); }
    .bottom { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
    .status-row { display: flex; justify-content: flex-end; }
  `],
  template: `
    <div class="messages" aria-live="polite" aria-label="Chat messages">
      @for (msg of messages(); track msg.id) {
        <chat-message [message]="msg" (citationClicked)="onCitationClicked(msg, $event)" />
      }
    </div>

    <!-- Starters for an empty conversation; once it has begun they only take up space. -->
    @if (suggested().length && docLoaded() && messages().length === 0) {
      <div class="suggested">
        <span class="suggested-label">Try</span>
        @for (q of suggested(); track q) {
          <button class="suggested-item" (click)="onSuggestedClick(q, $event)">{{ q }}</button>
        }
      </div>
    }

    <div class="bottom">
      <chat-composer
        [disabled]="streaming() || !llm.loaded() || llm.loading() || !docLoaded()"
        (submitted)="submit($event)"
      />
      <div class="status-row">
        <ui-status-chip
          [state]="llm.error() ? 'error' : llm.loading() ? 'loading' : llm.loaded() ? 'ready' : 'idle'"
          [tokensPerSec]="llm.tokensPerSec()"
          [loadProgress]="loadProgress"
          [errorMessage]="llm.error()"
        />
      </div>
    </div>
  `,
})
export class ChatPanelComponent {
  readonly llm = inject(LlmService);
  private rag = inject(RagService);

  docLoaded = input<boolean>(false);
  citationsChanged = output<HighlightSpan[]>();

  messages = signal<Message[]>([]);
  suggested = signal<string[]>([
    'Summarize this document',
    'What are the key points?',
    'Are there any action items?',
  ]);
  streaming = signal(false);

  onCitationClicked(msg: Message, citation: Citation) {
    this.citationsChanged.emit(spansForCitation(msg.content, msg.citations ?? [], citation));
  }

  onSuggestedClick(q: string, e: MouseEvent) {
    (e.currentTarget as HTMLElement).blur();
    this.submit(q);
  }

  submit(question: string) {
    if (this.streaming() || !this.llm.loaded() || !this.docLoaded()) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: question };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true };

    this.messages.update(m => [...m, userMsg, assistantMsg]);
    this.streaming.set(true);

    // Whole-document questions ("Summarize this document") get excerpts from across the document;
    // the top few by similarity would only cover the handful of pages nearest the question.
    const results$ = isOverviewQuestion(question) ? of(this.rag.overview(8)) : this.rag.query$(question, 3);

    results$.subscribe(results => {
      const citations: Citation[] = results.map(r => ({
        chunkId: r.chunk.id,
        text: r.chunk.text,
        pageNumber: r.chunk.pageNumber,
        startWord: r.chunk.startWord,
        score: r.score,
      }));
      this.citationsChanged.emit([]);

      let fullContent = '';
      let tokenCount = 0;
      let firstTokenAt = 0;

      this.llm.generate$(buildPrompt(results, question)).subscribe({
        next: ({ token }) => {
          fullContent += token;
          // Each streamed chunk is one token; time from the first token so prompt prefill isn't counted.
          tokenCount++;
          if (tokenCount === 1) firstTokenAt = Date.now();
          const elapsed = (Date.now() - firstTokenAt) / 1000;
          if (elapsed > 0) this.llm.tokensPerSec.set(Math.round((tokenCount - 1) / elapsed));
          this.messages.update(m =>
            m.map(msg => msg.id === assistantId
              ? { ...msg, content: fullContent, citations }
              : msg)
          );
        },
        error: (err) => {
          this.messages.update(m =>
            m.map(msg => msg.id === assistantId
              ? { ...msg, content: `Error: ${err.message}`, streaming: false }
              : msg)
          );
          this.streaming.set(false);
        },
        complete: () => {
          const content = repairCitations(fullContent, citations);
          this.citationsChanged.emit(citedSpans(content, citations));
          this.messages.update(m =>
            m.map(msg => msg.id === assistantId ? { ...msg, content, streaming: false } : msg)
          );
          this.streaming.set(false);
        },
      });
      
    });
  }
  get loadProgress() {
  return this.llm.loadProgress();
  }
}
