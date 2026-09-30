import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import type { BackendChatEvent, BackendCitation } from '@doclocal/data-backend';
import { BackendService } from '@doclocal/data-backend';
import { ChatPanelComponent } from './chat-panel.component';

// The chat must never load the browser model runtimes; importing them at runtime fails the suite.
jest.mock('@doclocal/data-webllm', () => {
  throw new Error('chat panel must not load the WebLLM runtime');
});
jest.mock('@doclocal/data-rag', () => {
  throw new Error('chat panel must not load the local embedding runtime');
});

// jsdom has no crypto.randomUUID (used for message ids).
let nextId = 0;
Object.defineProperty(globalThis.crypto, 'randomUUID', {
  value: () => `id-${nextId++}`,
  configurable: true,
});

type Status = 'none' | 'creating' | 'ready' | 'indexing' | 'error';

function setup(status: Status = 'ready', error: string | null = null) {
  const events = new Subject<BackendChatEvent>();
  const chat = jest.fn(() => events);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BackendService,
        useValue: {
          sessionStatus: signal<Status>(status),
          sessionError: signal<string | null>(error),
          chat$: chat,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ChatPanelComponent);
  fixture.componentRef.setInput('docLoaded', true);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  const spans: unknown[] = [];
  fixture.componentInstance.citationsChanged.subscribe((value) => spans.push(value));
  return {
    fixture,
    el,
    events,
    chat,
    spans,
    panel: fixture.componentInstance,
    backend: TestBed.inject(BackendService),
    suggestions: () => el.querySelectorAll('.suggested .suggested-item'),
    lastMessage: () =>
      [...el.querySelectorAll('chat-message')].at(-1)?.textContent?.replace('▋', '').trim(),
  };
}

const citation = (chunkId: string, text = 'The deadline is Friday.'): BackendCitation => ({
  chunkId,
  text,
  pageNumber: 2,
  startWord: 0,
  score: 0.9,
});

describe('ChatPanelComponent suggested questions', () => {
  it('offers suggestions before the conversation starts', () => {
    expect(setup().suggestions()).toHaveLength(3);
  });

  it('hides suggestions once a question is asked', () => {
    const { fixture, suggestions } = setup();
    (suggestions()[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(suggestions()).toHaveLength(0);
  });
});

describe('ChatPanelComponent indexing state', () => {
  // ngModel applies `disabled` to the textarea asynchronously; the composer's class is synchronous.
  const disabled = (el: HTMLElement) => !!el.querySelector('.composer--disabled');
  const status = (el: HTMLElement) => el.querySelector('[role=status]')?.textContent?.trim();

  it('shows NIM indexing and keeps the composer disabled until the session is ready', () => {
    const { el, suggestions } = setup('indexing');
    expect(status(el)).toBe('Indexing with NVIDIA NIM…');
    expect(disabled(el)).toBe(true);
    expect(suggestions()).toHaveLength(0);
  });

  it('shows an indexing error where the user can see it', () => {
    const { el } = setup('error', 'Backend request failed (503).');
    expect(el.querySelector('[role=alert]')?.textContent).toContain('503');
    expect(disabled(el)).toBe(true);
  });

  it('enables the composer once the session is ready', () => {
    const { el } = setup('ready');
    expect(status(el)).toBeUndefined();
    expect(disabled(el)).toBe(false);
  });

  it('ignores submissions before the session is ready', () => {
    const { panel, chat } = setup('none');
    panel.submit('Too early');
    expect(chat).not.toHaveBeenCalled();
    expect(panel.messages()).toEqual([]);
  });
});

describe('ChatPanelComponent streamed answers', () => {
  it('shows stages, streams tokens and emits cited spans when done', () => {
    const { fixture, events, chat, spans, lastMessage, panel } = setup();
    panel.submit('When is it due?');
    fixture.detectChanges();
    expect(chat).toHaveBeenCalledWith('When is it due?');
    expect(lastMessage()).toBe('Sending to NVIDIA NIM…');

    events.next({ type: 'citations', citations: [citation('a'), citation('b'), citation('c')] });
    fixture.detectChanges();
    expect(lastMessage()).toBe('Reading 3 excerpts…');

    // A marker streamed in ahead of any text keeps the stage up rather than blanking the bubble.
    events.next({ type: 'token', token: '[' });
    fixture.detectChanges();
    expect(lastMessage()).toBe('Reading 3 excerpts…');

    events.next({ type: 'token', token: '1] The deadline is Friday [1].' });
    events.next({ type: 'done' });
    fixture.detectChanges();
    expect(panel.streaming()).toBe(false);
    expect(panel.messages().at(-1)?.citations).toHaveLength(3);
    const last = spans.at(-1) as { chunkId: string; pageNumber: number }[];
    expect(last.length).toBeGreaterThan(0);
    expect(last[0]).toEqual(expect.objectContaining({ chunkId: 'a', pageNumber: 2 }));
  });

  it('uses the singular for one excerpt', () => {
    const { fixture, events, lastMessage, panel } = setup();
    panel.submit('q');
    events.next({ type: 'citations', citations: [citation('a')] });
    fixture.detectChanges();
    expect(lastMessage()).toBe('Reading 1 excerpt…');
  });

  it('flags a length-limited answer and explains an empty one', () => {
    const { fixture, events, el, panel } = setup();
    panel.submit('q');
    events.next({ type: 'citations', citations: [] });
    events.next({ type: 'done', finishReason: 'length' });
    fixture.detectChanges();
    expect(el.querySelector('.truncated-warning')).toBeTruthy();
    expect(panel.messages().at(-1)?.content).toMatch(/token limit/);
  });
});

describe('ChatPanelComponent failures', () => {
  it('shows a backend error event and lets the user ask again', () => {
    const { fixture, events, lastMessage, panel } = setup();
    panel.submit('q');
    events.next({ type: 'error', message: 'NIM is busy', code: 'upstream', retryable: true });
    fixture.detectChanges();
    expect(lastMessage()).toBe('Error: NIM is busy (retryable)');
    expect(panel.streaming()).toBe(false);
    expect(panel.composerDisabled()).toBe(false);
  });

  it('keeps partial text and marks it incomplete on a mid-answer error event', () => {
    const { events, panel } = setup();
    panel.submit('q');
    events.next({ type: 'token', token: 'Partial answer' });
    events.next({ type: 'error', message: 'Stream cut', code: 'upstream', retryable: false });
    expect(panel.messages().at(-1)?.content).toBe(
      'Partial answer\n\nAnswer incomplete. Stream cut [upstream]',
    );
  });

  it('keeps partial text when the connection fails', () => {
    const { events, panel } = setup();
    panel.submit('q');
    events.next({ type: 'token', token: 'Partial answer' });
    events.error(new Error('Stream closed without a terminal event; answer is incomplete.'));
    expect(panel.messages().at(-1)?.content).toContain('Partial answer');
    expect(panel.messages().at(-1)?.content).toContain('Answer incomplete');
    expect(panel.streaming()).toBe(false);
  });
});

describe('ChatPanelComponent Stop', () => {
  it('cancels the stream and preserves partial text', () => {
    const { fixture, events, panel } = setup();
    panel.submit('q');
    events.next({ type: 'token', token: 'Partial answer' });
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      '[aria-label="Stop generating"]',
    ) as HTMLButtonElement;
    button.click();
    expect(events.observed).toBe(false);
    expect(panel.streaming()).toBe(false);
    expect(panel.messages().at(-1)?.content).toBe(
      'Partial answer\n\nCancelled — answer incomplete.',
    );
  });
});

describe('document replacement (#31)', () => {
  it('clears answers and citations when the document is removed', () => {
    const { fixture, events, el, spans, panel } = setup();
    panel.submit('q');
    events.next({ type: 'citations', citations: [citation('a')] });
    events.next({ type: 'token', token: 'The deadline is Friday [1].' });
    events.next({ type: 'done' });
    fixture.detectChanges();
    expect(el.querySelectorAll('chat-message')).toHaveLength(2);
    fixture.componentRef.setInput('docLoaded', false);
    fixture.detectChanges();
    expect(el.querySelectorAll('chat-message')).toHaveLength(0);
    expect(spans.at(-1)).toEqual([]);
  });

  it('cancels a streaming answer and ignores late events after replacement', () => {
    const { fixture, events, spans, panel } = setup();
    panel.submit('Old question');
    fixture.componentRef.setInput('documentVersion', 1);
    fixture.detectChanges();
    const before = spans.length;
    expect(events.observed).toBe(false);
    events.next({ type: 'token', token: 'Late answer [1]' });
    events.next({ type: 'done' });
    expect(panel.messages()).toEqual([]);
    expect(panel.streaming()).toBe(false);
    expect(spans).toHaveLength(before);
  });

  it('unsubscribes from the stream when the chat is destroyed', () => {
    const { fixture, events, panel } = setup();
    panel.submit('q');
    fixture.destroy();
    expect(events.observed).toBe(false);
  });
});
