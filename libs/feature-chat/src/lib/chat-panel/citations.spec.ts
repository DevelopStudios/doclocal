import { citedSpans, repairCitations, spansForCitation } from './citations';
import type { Citation } from '../model';

const cite = (chunkId: string, text: string, startWord = 0, pageNumber = 1): Citation =>
    ({ chunkId, text, pageNumber, startWord, score: 1 });

const words = (spanText: string, chunk: Citation, start: number, end: number) =>
    expect(chunk.text.split(' ').slice(start - chunk.startWord, end - chunk.startWord).join(' ')).toBe(spanText);

describe('citedSpans', () => {
    const resume = cite('c1',
        'Tree Felling Crew Jan 2016 – Jan 2019 residential tree felling. ' +
        '• Operated chainsaws and mowers daily. ' +
        '• Worked outdoors in all weather.', 10, 2);
    const school = cite('c2', 'EDUCATION National Senior Certificate 2015. Subjects: Engineering Graphics and Design.');

    it('highlights only the sentences of the cited excerpt that support the claim', () => {
        const spans = citedSpans('He operated chainsaws and mowers [1].', [resume, school]);
        expect(spans).toHaveLength(1);
        expect(spans[0]).toMatchObject({ chunkId: 'c1', pageNumber: 2 });
        words('• Operated chainsaws and mowers daily.', resume, spans[0].startWord, spans[0].endWord);
    });

    it('matches each citation against its own claim', () => {
        const spans = citedSpans(
            'He felled trees from 2016 to 2019 [1] and holds a National Senior Certificate [2].',
            [resume, school]);
        expect(spans.map(s => s.chunkId)).toEqual(['c1', 'c2']);
        words('Tree Felling Crew Jan 2016 – Jan 2019 residential tree felling.', resume, spans[0].startWord, spans[0].endWord);
        words('EDUCATION National Senior Certificate 2015.', school, spans[1].startWord, spans[1].endWord);
    });

    it('uses the preceding text as the claim for a trailing sources list', () => {
        const spans = citedSpans('He works outdoors in all weather. Sources: [1] [2]', [resume, school]);
        expect(spans).toHaveLength(1);
        words('• Worked outdoors in all weather.', resume, spans[0].startWord, spans[0].endWord);
    });

    it('uses the whole answer as the claim when sources follow a "Sources:" label mid-sentence', () => {
        const jobs = cite('c3',
            'Developer at TouchFoundry Feb 2019 – Sep 2021. ' +
            'Team Lead at Nclose Sep 2021 – Nov 2025. ' +
            'Studied technical subjects at school in 2015.');
        const spans = citedSpans(
            'He was a Developer at TouchFoundry. Then Team Lead at Nclose. He studied technical subjects at school Sources: [1]',
            [jobs]);
        expect(spans).toHaveLength(3);
    });

    it('ignores sentences that only share words common across the excerpts', () => {
        const chunk = cite('c4',
            'Worked long days outdoors. ' +
            'Used to long days of repetitive work. ' +
            'Long days on residential work sites. ' +
            'National Senior Certificate 2015 with technical subjects.');
        const spans = citedSpans('He earned a National Senior Certificate after long days of work [1].', [chunk]);
        expect(spans).toHaveLength(1);
        words('National Senior Certificate 2015 with technical subjects.', chunk, spans[0].startWord, spans[0].endWord);
    });

    it('returns nothing when the answer cites nothing or cites out of range', () => {
        expect(citedSpans('No citations here.', [resume])).toEqual([]);
        expect(citedSpans('Chainsaws [0] and mowers [7].', [resume])).toEqual([]);
    });
});

describe('repairCitations', () => {
    const questions = cite('c1', 'A good resume answers 3 questions. What do you seek to do? Why are you qualified?', 0, 5);
    const formats = cite('c2', 'Chronological Resume Tips and Examples. Common resume formats: chronological, functional, hybrid.', 0, 40);
    const keywordsTip = cite('c3', 'Where to find keywords and relevant skills: read the job posting carefully.', 0, 22);
    const excerpts = [questions, formats, keywordsTip];

    it('renumbers a marker to the excerpt that actually supports its sentence', () => {
        expect(repairCitations('A good resume answers 3 questions: what you seek to do and why you are qualified [2].', excerpts))
            .toBe('A good resume answers 3 questions: what you seek to do and why you are qualified [1].');
    });

    it('keeps a marker whose excerpt supports the sentence at least as well as any other', () => {
        const answer = 'Common formats are chronological, functional and hybrid [2]. Read the job posting for keywords [3].';
        expect(repairCitations(answer, excerpts)).toBe(answer);
    });

    it('repairs an out-of-range marker when an excerpt clearly supports the sentence', () => {
        expect(repairCitations('Read the job posting carefully for keywords [7].', excerpts))
            .toBe('Read the job posting carefully for keywords [3].');
    });

    it('leaves the answer alone when no excerpt clearly supports the sentence', () => {
        expect(repairCitations('Salaries vary by region [2].', excerpts)).toBe('Salaries vary by region [2].');
        expect(repairCitations("I couldn't find that in the document.", excerpts)).toBe("I couldn't find that in the document.");
    });
});

describe('spansForCitation', () => {
    const resume = cite('c1', 'Operated chainsaws and mowers daily. Worked outdoors in all weather.', 10, 2);
    const school = cite('c2', 'EDUCATION National Senior Certificate 2015.', 0, 7);

    it("returns only the clicked excerpt's supporting sentences", () => {
        const answer = 'He operated chainsaws and mowers [1] and holds a National Senior Certificate [2].';
        const spans = spansForCitation(answer, [resume, school], school);
        expect(spans).toEqual([{ chunkId: 'c2', pageNumber: 7, startWord: 0, endWord: 5 }]);
    });

    it('falls back to the whole excerpt when no sentence matches the claim', () => {
        const spans = spansForCitation('Something unrelated [1].', [resume, school], resume);
        expect(spans).toEqual([{ chunkId: 'c1', pageNumber: 2, startWord: 10, endWord: 20 }]);
    });
});
