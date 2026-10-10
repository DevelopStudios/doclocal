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
import { ComposerComponent, type ComposerState } from '../composer/composer.component';
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
        font-size: var(--text-micro);
        line-height: var(--leading-tight);
        color: var(--color-text-dim);
        text-transform: uppercase;
        letter-spacing: var(--tracking-caps);
      }
      /* Surface pills: a quiet offer, not a call to action. */
      .suggested-item {
        background: var(--color-surface);
        border: 1px solid var(--color-hairline);
        border-radius: 999px;
        padding: 5px 12px;
        font-family: var(--font-sans);
        font-size: var(--text-secondary);
        line-height: var(--leading-ui);
        color: var(--color-text-muted);
        cursor: pointer;
        transition:
          border-color 0.15s,
          background 0.15s,
          color 0.15s;
      }
      /* Accent on hover only: these are clickable, so accent is the right family. */
      .suggested-item:hover {
        border-color: var(--color-accent);
        background: var(--color-surface-raised);
        color: var(--color-text);
      }
      .suggested-item:focus-visible {
        outline: 2px solid var(--color-accent);
        outline-offset: 2px;
      }
      .bottom {
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .index-error {
        font-size: var(--text-secondary);
        line-height: var(--leading-ui);
        font-weight: var(--weight-medium);
        color: var(--color-text);
        border-left: 2px solid var(--color-hairline);
        padding-left: 8px;
      }
      .truncated-warning {
        font-size: var(--text-secondary);
        line-height: var(--leading-ui);
        color: var(--color-text-muted);
      }
      /* The composer carries progress visually; a placeholder change is not announced,
         so the live region stays for screen readers only. */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
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
        <p class="sr-only" role="status">Indexing with NVIDIA NIM…</p>
      }
      @if (truncated()) {
        <p class="truncated-warning">Answer may be truncated (hit token limit).</p>
      }
      <chat-composer
        [state]="composerState()"
        [excerptCount]="excerptCount()"
        [progress]="indexProgress()"
        (submitted)="submit($event)"
        (stopped)="stop()"
      />
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
  /** How many excerpts the current question retrieved, for the composer's placeholder. */
  excerptCount = signal(0);
  /** Whether answer text has started arriving, which separates `retrieving` from `writing`. */
  answering = signal(false);

  indexReady = computed(() => this.backend.sessionStatus() === 'ready');

  composerDisabled = computed(() => this.streaming() || !this.docLoaded() || !this.indexReady());

  /**
   * The one control's state. Everything the column is doing is one of these five, and
   * nothing else in the column reports status any more.
   */
  composerState = computed<ComposerState>(() => {
    if (this.streaming()) return this.answering() ? 'writing' : 'retrieving';
    if (!this.docLoaded()) return 'disabled';
    const status = this.backend.sessionStatus();
    // `error` is the "model cannot run" case: a failed index or a model that won't load.
    if (status === 'error') return 'disabled';
    if (status === 'ready') return 'idle';
    return 'indexing';
  });

  /**
   * On-device, the long wait is the model download, and `LocalBackend` exposes it as
   * optional signals. The hosted backend has no number, so the rule sweeps instead.
   * Read structurally rather than by importing `data-webllm`, which this lib must not
   * pull into the chat column.
   */
  private readonly deviceModel = this.backend as unknown as {
    modelLoading?: () => boolean;
    modelProgress?: () => number;
  };

  indexProgress = computed<number | null>(() => {
    const loading = this.deviceModel.modelLoading;
    if (!loading || !loading()) return null;
    const value = this.deviceModel.modelProgress?.() ?? 0;
    // Zero is "no number yet", not "none done": a rule sitting at 0% reads as stalled.
    return value > 0 ? value : null;
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['docLoaded'] || changes['documentVersion']) {
      this.pending.unsubscribe();
      this.pending = new Subscription();
      this.messages.set([]);
      this.streaming.set(false);
      this.truncated.set(false);
      this.excerptCount.set(0);
      this.answering.set(false);
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
    this.excerptCount.set(0);
    this.answering.set(false);
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
            this.excerptCount.set(citations.length);
            const stage =
              citations.length > 0
                ? `Reading ${citations.length} ${citations.length === 1 ? 'excerpt' : 'excerpts'}…`
                : 'Generating answer…';
            this.messages.update((m) =>
              m.map((msg) => (msg.id === assistantId ? { ...msg, stage, citations } : msg)),
            );
          } else if (event.type === 'token') {
            fullContent += event.token;
            // A bare citation marker is not an answer yet, so the composer stays on
            // `retrieving` until real prose arrives -- same rule the bubble's stage uses.
            if (/[^\s[\]\d]/.test(fullContent)) this.answering.set(true);
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
            this.answering.set(false);
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
            this.answering.set(false);
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
    this.answering.set(false);
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
    this.answering.set(false);
  }
}
