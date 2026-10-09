import {
  Component,
  computed,
  inject,
  input,
  OnChanges,
  OnDestroy,
  output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { BackendService } from '@doclocal/data-backend';
import type { BackendChatEvent } from '@doclocal/data-backend';
import { MessageComponent } from '../message/message.component';
import { ComposerComponent } from '../composer/composer.component';
import type { Citation, Message } from '../model';
import type { HighlightSpan } from '@doclocal/data-pdf';
import { attachCitations, citedSpans, repairCitations, spansForCitation } from './citations';

@Component({
  selector: 'chat-panel',
  standalone: true,
  imports: [MessageComponent, ComposerComponent],
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .messages {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .suggested {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        padding: 0 16px 8px;
      }
      .suggested-label {
        font-size: 11px;
        font-family: var(--font-mono);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .suggested-item {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 4px 12px;
        font-size: 12px;
        color: var(--color-text-muted);
        cursor: pointer;
        transition:
          border-color 0.15s,
          color 0.15s;
      }
      .suggested-item:hover {
        border-color: var(--color-accent);
        color: var(--color-text);
      }
      .bottom {
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .index-status {
        font-size: 12px;
        font-family: var(--font-mono);
        color: var(--color-text-muted);
      }
      .index-error {
        font-size: 12px;
        color: #f87171;
      }
      .backend-status {
        font-size: 12px;
        font-family: var(--font-mono);
        color: var(--color-text-muted);
      }
      .truncated-warning {
        font-size: 12px;
        color: #fb923c;
      }
    `,
  ],
  template: `
    <div class="messages" aria-live="polite" aria-label="Chat messages">
      @for (msg of messages(); track msg.id) {
        <chat-message [message]="msg" (citationClicked)="onCitationClicked(msg, $event)" />
      }
    </div>

    @if (suggested().length && docLoaded() && indexReady() && messages().length === 0) {
      <div class="suggested">
        <span class="suggested-label">Try</span>
        @for (q of suggested(); track q) {
          <button class="suggested-item" (click)="onSuggestedClick(q, $event)">{{ q }}</button>
        }
      </div>
    }

    <div class="bottom">
      @if (docLoaded() && backend.sessionError()) {
        <p class="index-error" role="alert">
          Couldn't index this document: {{ backend.sessionError() }}
        </p>
      } @else if (docLoaded() && backend.sessionStatus() === 'indexing') {
        <p class="backend-status" role="status">Indexing with NVIDIA NIM…</p>
      }
      @if (truncated()) {
        <p class="truncated-warning">Answer may be truncated (hit token limit).</p>
      }
      @if (streaming()) {
        <button class="suggested-item" aria-label="Stop generating" (click)="stop()">
          Stop generating
        </button>
      }
      <chat-composer [disabled]="composerDisabled()" (submitted)="submit($event)" />
    </div>
  `,
})
export class ChatPanelComponent implements OnChanges, OnDestroy {
  private pending = new Subscription();
  readonly backend = inject(BackendService);

  docLoaded = input<boolean>(false);
  documentVersion = input<number>(0);
  citationsChanged = output<HighlightSpan[]>();

  messages = signal<Message[]>([]);
  suggested = signal<string[]>([
    'Summarize this document',
    'What are the key points?',
    'Are there any action items?',
  ]);
  streaming = signal(false);
  truncated = signal(false);

  indexReady = computed(() => this.backend.sessionStatus() === 'ready');

  composerDisabled = computed(() => this.streaming() || !this.docLoaded() || !this.indexReady());

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['docLoaded'] || changes['documentVersion']) {
      this.pending.unsubscribe();
      this.pending = new Subscription();
      this.messages.set([]);
      this.streaming.set(false);
      this.truncated.set(false);
      this.citationsChanged.emit([]);
    }
  }

  ngOnDestroy(): void {
    this.pending.unsubscribe();
  }

  onCitationClicked(msg: Message, citation: Citation): void {
    this.citationsChanged.emit(spansForCitation(msg.content, msg.citations ?? [], citation));
  }

  onSuggestedClick(q: string, e: MouseEvent): void {
    (e.currentTarget as HTMLElement).blur();
    this.submit(q);
  }

  submit(question: string): void {
    if (this.composerDisabled()) return;
    const { userMsg, assistantMsg, assistantId } = this.makeAssistantPair(question);
    this.messages.update((m) => [...m, userMsg, assistantMsg]);
    this.streaming.set(true);
    this.truncated.set(false);
    this.citationsChanged.emit([]);

    let citations: Citation[] = [];
    let fullContent = '';

    this.pending.unsubscribe();
    this.pending = new Subscription();

    this.pending.add(
      this.backend.chat$(question).subscribe({
        next: (event: BackendChatEvent) => {
          if (event.type === 'citations') {
            citations = event.citations.map((c) => ({
              chunkId: c.chunkId,
              text: c.text,
              pageNumber: c.pageNumber,
              startWord: c.startWord,
              score: c.score,
            }));
            const stage =
              citations.length > 0
                ? `Reading ${citations.length} ${citations.length === 1 ? 'excerpt' : 'excerpts'}…`
                : 'Generating answer…';
            this.messages.update((m) =>
              m.map((msg) => (msg.id === assistantId ? { ...msg, stage, citations } : msg)),
            );
          } else if (event.type === 'token') {
            fullContent += event.token;
            this.messages.update((m) =>
              m.map((msg) =>
                msg.id === assistantId ? { ...msg, content: fullContent, citations } : msg,
              ),
            );
          } else if (event.type === 'done') {
            if (event.finishReason === 'length') this.truncated.set(true);
            // gpt-oss can spend the whole token budget reasoning and return no visible text.
            // attachCitations first: it only fires when the model emitted no markers at all,
            // and repairCitations can then renumber whatever is there, from either source.
            const content =
              repairCitations(attachCitations(fullContent, citations), citations) ||
              (event.finishReason === 'length'
                ? 'No answer: the model hit its token limit. Try a narrower question.'
                : '');
            this.citationsChanged.emit(citedSpans(content, citations));
            this.messages.update((m) =>
              m.map((msg) =>
                msg.id === assistantId ? { ...msg, content, citations, streaming: false } : msg,
              ),
            );
            this.streaming.set(false);
          } else {
            const errText = event.retryable ? `${event.message} (retryable)` : event.message;
            const content = fullContent
              ? `${fullContent}\n\nAnswer incomplete. ${errText} [${event.code}]`
              : `Error: ${errText}`;
            this.messages.update((m) =>
              m.map((msg) =>
                msg.id === assistantId ? { ...msg, content, streaming: false } : msg,
              ),
            );
            this.streaming.set(false);
          }
        },
        error: (err: Error) => this.fail(assistantId, err),
      }),
    );
  }

  private makeAssistantPair(question: string): {
    userMsg: Message;
    assistantMsg: Message;
    assistantId: string;
  } {
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: question };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
      stage: 'Sending to NVIDIA NIM…',
    };
    return { userMsg, assistantMsg, assistantId };
  }

  stop(): void {
    this.pending.unsubscribe();
    this.pending = new Subscription();
    this.messages.update((messages) =>
      messages.map((message) =>
        message.streaming
          ? {
              ...message,
              content: `${message.content}${message.content ? '\n\n' : ''}Cancelled — answer incomplete.`,
              streaming: false,
              stage: undefined,
            }
          : message,
      ),
    );
    this.streaming.set(false);
  }

  private fail(assistantId: string, err: Error): void {
    this.messages.update((m) =>
      m.map((msg) =>
        msg.id === assistantId
          ? {
              ...msg,
              content: `${msg.content}${msg.content ? '\n\nAnswer incomplete. ' : ''}Error: ${err.message}`,
              streaming: false,
            }
          : msg,
      ),
    );
    this.streaming.set(false);
  }
}
