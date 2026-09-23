import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import type { RagResult } from '@doclocal/data-rag';
import { LlmService } from '@doclocal/data-webllm';
import { RagService } from '@doclocal/data-rag';
import { ChatPanelComponent } from './chat-panel.component';

// The real services start Web Workers via import.meta.url, which Jest can't load; stand-in
// classes keep the injection tokens the component asks for.
jest.mock('@doclocal/data-webllm', () => ({ LlmService: class LlmService {} }));
jest.mock('@doclocal/data-rag', () => ({ RagService: class RagService {} }));

// jsdom has no crypto.randomUUID (used for message ids).
let nextId = 0;
Object.defineProperty(globalThis.crypto, 'randomUUID', { value: () => `id-${nextId++}`, configurable: true });

interface RagState { ready: boolean; progress?: { done: number; total: number }; error?: string | null }

function setup(rag: RagState = { ready: true }, results$: Observable<RagResult[]> = of([])) {
    const tokens = new Subject<{ token: string }>();
    TestBed.configureTestingModule({
        providers: [
            {
                provide: LlmService,
                useValue: {
                    loaded: signal(true), loading: signal(false), error: signal<string | null>(null),
                    tokensPerSec: signal(0), loadProgress: signal(1),
                    generate$: () => tokens,
                },
            },
            {
                provide: RagService,
                useValue: {
                    query$: () => results$, overview: () => [],
                    ready: signal(rag.ready), indexing: signal(!rag.ready && !rag.error),
                    progress: signal(rag.progress ?? { done: 0, total: 0 }), error: signal(rag.error ?? null),
                },
            },
        ],
    });
    const fixture = TestBed.createComponent(ChatPanelComponent);
    fixture.componentRef.setInput('docLoaded', true);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return { fixture, el, tokens, suggestions: () => el.querySelectorAll('.suggested-item') };
}

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

    it('hides suggestions after a typed question too', () => {
        const { fixture, suggestions } = setup();
        fixture.componentInstance.submit('What is this?');
        fixture.detectChanges();
        expect(suggestions()).toHaveLength(0);
    });
});

describe('ChatPanelComponent indexing state', () => {
    // ngModel applies `disabled` to the textarea asynchronously; the composer's class is synchronous.
    const composer = (el: HTMLElement) => ({ disabled: !!el.querySelector('.composer--disabled') });
    const status = (el: HTMLElement) => el.querySelector('.index-status')?.textContent?.trim();

    it('shows indexing progress and keeps the composer disabled until the index is ready', () => {
        const { el } = setup({ ready: false, progress: { done: 16, total: 47 } });
        expect(status(el)).toBe('Indexing document… 16 / 47');
        expect(composer(el).disabled).toBe(true);
    });

    it('does not offer suggestions before the index is ready', () => {
        expect(setup({ ready: false, progress: { done: 0, total: 47 } }).suggestions()).toHaveLength(0);
    });

    it('shows an indexing error where the user can see it', () => {
        const { el } = setup({ ready: false, error: 'Model not ready' });
        expect(el.querySelector('[role=alert]')?.textContent).toContain('Model not ready');
        expect(composer(el).disabled).toBe(true);
    });

    it('enables the composer and hides the status once the index is ready', () => {
        const { el } = setup({ ready: true });
        expect(status(el)).toBeUndefined();
        expect(composer(el).disabled).toBe(false);
    });
});

describe('ChatPanelComponent answer stages', () => {
    const result = (id: string): RagResult => ({ chunk: { id, text: 'x', pageNumber: 1, startWord: 0 }, score: 1 });
    const lastMessage = (el: HTMLElement) => [...el.querySelectorAll('chat-message')].at(-1)?.textContent?.replace('▋', '').trim();

    it('says what it is doing before the first token arrives, then shows the answer', () => {
        const results$ = new Subject<RagResult[]>();
        const { fixture, el, tokens } = setup({ ready: true }, results$);
        fixture.componentInstance.submit('What is this?');
        fixture.detectChanges();
        expect(lastMessage(el)).toBe('Searching document…');

        results$.next([result('a'), result('b'), result('c')]);
        fixture.detectChanges();
        expect(lastMessage(el)).toBe('Reading 3 excerpts…');

        // A marker streamed in ahead of any text keeps the stage up rather than blanking the bubble.
        tokens.next({ token: '[' });
        fixture.detectChanges();
        expect(lastMessage(el)).toBe('Reading 3 excerpts…');
        tokens.next({ token: '1] ' });
        fixture.detectChanges();
        expect(lastMessage(el)).toBe('Reading 3 excerpts…');

        tokens.next({ token: 'It is' });
        fixture.detectChanges();
        expect(lastMessage(el)).toBe('It is');
    });

    it('uses the singular for one excerpt', () => {
        const results$ = new Subject<RagResult[]>();
        const { fixture, el } = setup({ ready: true }, results$);
        fixture.componentInstance.submit('What is this?');
        results$.next([result('a')]);
        fixture.detectChanges();
        expect(lastMessage(el)).toBe('Reading 1 excerpt…');
    });
});

describe('ChatPanelComponent failures', () => {
    const lastMessage = (el: HTMLElement) => [...el.querySelectorAll('chat-message')].at(-1)?.textContent?.replace('▋', '').trim();

    it('reports a failed retrieval and lets the user ask again', () => {
        const { fixture, el } = setup({ ready: true }, throwError(() => new Error('Embedding worker crashed')));
        fixture.componentInstance.submit('What is this?');
        fixture.detectChanges();
        expect(lastMessage(el)).toBe('Error: Embedding worker crashed');
        expect(fixture.componentInstance.streaming()).toBe(false);
        expect(el.querySelector('.cursor')).toBeNull();
    });

    it('reports a failed generation and lets the user ask again', () => {
        const { fixture, el, tokens } = setup({ ready: true });
        fixture.componentInstance.submit('What is this?');
        tokens.error(new Error('Engine not loaded'));
        fixture.detectChanges();
        expect(lastMessage(el)).toBe('Error: Engine not loaded');
        expect(fixture.componentInstance.streaming()).toBe(false);
    });
});
