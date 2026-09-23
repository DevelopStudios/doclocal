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

function setup() {
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
            { provide: RagService, useValue: { query$: () => of([]), overview: () => [] } },
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
