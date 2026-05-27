import { Component, inject, output, signal } from '@angular/core';
  import { FormsModule } from '@angular/forms';
  import { RagService } from '@doclocal/data-rag';
  import type { RagResult } from '@doclocal/data-rag';
  import { LlmService } from '@doclocal/data-webllm';
  import { StatusChipComponent } from '@doclocal/ui-kit';
  import { MessageComponent } from '../message/message.component';
  import { ComposerComponent } from '../composer/composer.component';
  import type { Message, Citation } from '../model';
  
  function buildPrompt(results: RagResult[], question: string): string {
    if (results.length === 0) { 
      return `The document has no relevant content for this question. Say so 
  briefly.\n\nQuestion: ${question}`;
    }
    const context = results.map((r, i) => `[${i + 1}] ${r.chunk.text}`).join('\n\n');
    return `You are a helpful assistant answering questions about a document.
  Use only the provided excerpts. Cite sources with [1], [2], etc. Be concise.
  If the answer isn't in the excerpts, say "I couldn't find that in the document."

  Document excerpts:  
  ${context}

  Question: ${question}`;
  }
  
  @Component({
    selector: 'chat-panel',
    standalone: true,
    imports: [MessageComponent, ComposerComponent, StatusChipComponent],
    styles: [`
      :host { display: flex; flex-direction: column; height: 100%; }
      .messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; 
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
        color: var(--color-text-muted); cursor: pointer; transition: border-color 0.15s, 
  color 0.15s;
      }
      .suggested-item:hover { border-color: var(--color-accent); color: 
  var(--color-text); }
      .bottom { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
      .status-row { display: flex; justify-content: flex-end; }
    `],
    template: `
      <div class="messages">
        @for (msg of messages(); track msg.id) {
          <chat-message [message]="msg" />
        }
      </div>

      @if (suggested().length) {
        <div class="suggested">
          <span class="suggested-label">Suggested</span>
          @for (q of suggested(); track q) {
            <button class="suggested-item" (click)="submit(q)">{{ q }}</button>
          }
        </div>
      }

      <div class="bottom">
        <chat-composer [disabled]="streaming() || !llm.loaded()" 
  (submitted)="submit($event)" />
        <div class="status-row">
          <ui-status-chip
            [state]="llm.error() ? 'error' : llm.loading() ? 'loading' : llm.loaded() ? 
  'ready' : 'idle'"
            [tokensPerSec]="llm.tokensPerSec()"
            [loadProgress]="llm.loadProgress()"
            [errorMessage]="llm.error()"
          />
        </div>
      </div>
    `,
  })
  export class ChatPanelComponent {
    llm = inject(LlmService);
    private rag = inject(RagService);
  
    citationsChanged = output<string[]>();
  
    messages = signal<Message[]>([]);
    suggested = signal<string[]>([
      "What's the liability cap?",
      'Who owns the IP?',
      'Are there auto-renewal terms?',
    ]);
    streaming = signal(false);  

    submit(question: string) {
      if (this.streaming() || !this.llm.loaded()) return;

      const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: question
   };
      const assistantId = crypto.randomUUID();
      const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '',
  streaming: true };  

      this.messages.update(m => [...m, userMsg, assistantMsg]);
      this.streaming.set(true);

      this.rag.query$(question, 5).subscribe(results => {
        const citations: Citation[] = results.map(r => ({
          chunkId: r.chunk.id,
          text: r.chunk.text,
          pageNumber: r.chunk.pageNumber,
          score: r.score,
        }));
        this.citationsChanged.emit(citations.map(c => c.chunkId));
  
        let fullContent = '';
        let startTime = Date.now();

        this.llm.generate$(buildPrompt(results, question)).subscribe({
          next: ({ token }) => {
            fullContent += token;
            const elapsed = (Date.now() - startTime) / 1000;
            const tps = Math.round(fullContent.split(' ').length / elapsed);
            this.llm.tokensPerSec.set(tps);
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
            this.messages.update(m =>
              m.map(msg => msg.id === assistantId ? { ...msg, streaming: false } : msg)
            );
            this.streaming.set(false);
          },
        });
      });
    }
  }