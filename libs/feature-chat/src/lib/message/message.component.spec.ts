import { TestBed } from '@angular/core/testing';
import { MessageComponent } from './message.component';
import type { Citation, Message } from '../model';

const cite = (chunkId: string, pageNumber: number): Citation =>
    ({ chunkId, text: `Excerpt ${chunkId}`, pageNumber, startWord: 0, score: 1 });

function render(message: Message) {
    const fixture = TestBed.createComponent(MessageComponent);
    fixture.componentRef.setInput('message', message);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const chips = () => [...el.querySelectorAll<HTMLElement>('.cite-chip')];
    const hover = (i: number, event = 'mouseenter') => {
        chips()[i].dispatchEvent(new Event(event));
        fixture.detectChanges();
    };
    return { el, chips, hover };
}

describe('MessageComponent citation previews', () => {
    const answer: Message = {
        id: 'm1', role: 'assistant',
        content: 'First claim [1]. Second claim [1]. Third claim [2].',
        citations: [cite('c1', 5), cite('c2', 9)],
    };

    it('opens a preview only for the hovered chip, even when other chips cite the same excerpt', () => {
        const { el, hover } = render(answer);
        hover(1);
        const previews = el.querySelectorAll('.cite-preview');
        expect(previews).toHaveLength(1);
        expect(previews[0].closest('.cite-chip')).toBe(el.querySelectorAll('.cite-chip')[1]);
    });

    it('closes the preview when the pointer leaves the chip', () => {
        const { el, hover } = render(answer);
        hover(0);
        hover(0, 'mouseleave');
        expect(el.querySelectorAll('.cite-preview')).toHaveLength(0);
    });

    it('shows no preview for a chip that points past the retrieved excerpts', () => {
        const { el, hover } = render({ ...answer, content: 'Claim [7].' });
        hover(0);
        expect(el.querySelectorAll('.cite-preview')).toHaveLength(0);
    });
});

describe('MessageComponent citation chip accessibility', () => {
    const answer: Message = {
        id: 'm1', role: 'assistant',
        content: 'First claim [1]. Second claim [2]. Bad marker [7].',
        citations: [cite('c1', 5), cite('c2', 9)],
    };

    it('renders chips as buttons named after their source and page', () => {
        const { chips } = render(answer);
        expect(chips().map(c => c.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON']);
        expect(chips()[0].getAttribute('aria-label')).toBe('Source 1, page 5');
        expect(chips()[1].getAttribute('aria-label')).toBe('Source 2, page 9');
    });

    it('disables a chip that points past the retrieved excerpts', () => {
        const { chips } = render(answer);
        expect((chips()[2] as HTMLButtonElement).disabled).toBe(true);
    });

    it('opens the preview on keyboard focus and describes the chip with it', () => {
        const { el, chips, hover } = render(answer);
        hover(1, 'focus');
        const preview = el.querySelector('.cite-preview');
        expect(preview?.getAttribute('role')).toBe('tooltip');
        expect(chips()[1].getAttribute('aria-describedby')).toBe(preview?.id);
        hover(1, 'blur');
        expect(el.querySelector('.cite-preview')).toBeNull();
        expect(chips()[1].hasAttribute('aria-describedby')).toBe(false);
    });

    it('emits the citation when a chip is activated', () => {
        const fixture = TestBed.createComponent(MessageComponent);
        fixture.componentRef.setInput('message', answer);
        fixture.detectChanges();
        const emitted: Citation[] = [];
        fixture.componentInstance.citationClicked.subscribe(c => emitted.push(c));
        (fixture.nativeElement.querySelectorAll('.cite-chip')[1] as HTMLButtonElement).click();
        expect(emitted.map(c => c.chunkId)).toEqual(['c2']);
    });
});
