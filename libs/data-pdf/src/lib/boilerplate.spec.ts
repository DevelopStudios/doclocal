import { stripRepeatedText } from './boilerplate';

describe('stripRepeatedText', () => {
  it('strips a header repeated at the start of most pages, including a doubled header', () => {
    const pages = [
      'WWW.MWSE.ORG Presented by: Michigan Works! RESUME STRATEGIES',
      'WWW.MWSE.ORG WWW.MWSE.ORG Training Outcomes Upon completion',
      'WWW.MWSE.ORG WWW.MWSE.ORG What a resume IS',
      'WWW.MWSE.ORG WWW.MWSE.ORG Purpose of a resume',
      'WWW.MWSE.ORG WWW.MWSE.ORG A good resume answers 3 questions',
    ];
    expect(stripRepeatedText(pages)).toEqual([
      'Presented by: Michigan Works! RESUME STRATEGIES',
      'Training Outcomes Upon completion',
      'What a resume IS',
      'Purpose of a resume',
      'A good resume answers 3 questions',
    ]);
  });

  it('strips a footer whose page number changes from page to page', () => {
    const bodies = ['Alpha intro.', 'Beta details follow.', 'Gamma results.', 'Delta notes.', 'Epsilon summary.'];
    const pages = bodies.map((b, i) => `${b} Acme Corp Confidential Page ${i + 1} of 5`);
    expect(stripRepeatedText(pages)).toEqual(bodies);
  });

  it('keeps words that start fewer than 60% of pages', () => {
    const pages = ['The cat sat.', 'The dog ran.', 'A bird flew.', 'Fish swam.', 'Frogs hopped.'];
    expect(stripRepeatedText(pages)).toEqual(pages);
  });

  it('leaves documents with fewer than 4 pages alone', () => {
    const pages = ['Header one', 'Header two', 'Header three'];
    expect(stripRepeatedText(pages)).toEqual(pages);
  });

  it('empties a page whose only text is the running header (e.g. an image-only slide)', () => {
    const pages = ['Logo', 'Logo intro', 'Logo body', 'Logo end', 'Logo more'];
    expect(stripRepeatedText(pages)).toEqual(['', 'intro', 'body', 'end', 'more']);
  });

  it('keeps a one-word page that is not a header', () => {
    const pages = ['Appendix', 'Logo intro', 'Logo body', 'Logo end', 'Logo more'];
    expect(stripRepeatedText(pages)).toEqual(['Appendix', 'intro', 'body', 'end', 'more']);
  });
});
