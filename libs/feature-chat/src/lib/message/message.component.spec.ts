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
