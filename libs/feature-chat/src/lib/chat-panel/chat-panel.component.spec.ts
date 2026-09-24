import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
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

function setup(rag: RagState = { ready: true }) {
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
                    query$: () => of([]), overview: () => [],
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
