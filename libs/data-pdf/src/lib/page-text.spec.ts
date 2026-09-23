import { pageText } from './page-text';

describe('pageText', () => {
  it('joins text runs on a line with spaces and ends a line where pdf.js marks one', () => {
    expect(pageText([
      { str: 'Purpose of a resume', hasEOL: true },
      { str: '•', hasEOL: false }, { str: 'To get an', hasEOL: false }, { str: 'interview', hasEOL: true },
      { str: '• To describe', hasEOL: false },
    ])).toBe('Purpose of a resume\n• To get an interview\n• To describe');
  });

  it('collapses repeated spaces and blank lines, and trims the page', () => {
    expect(pageText([
      { str: '  Title  ', hasEOL: true }, { str: '', hasEOL: true }, { str: '', hasEOL: true },
      { str: 'Body   text', hasEOL: true },
    ])).toBe('Title\nBody text');
  });

  it('ignores marked-content items that carry no text', () => {
    expect(pageText([{ type: 'beginMarkedContent' }, { str: 'Hello', hasEOL: false }, { type: 'endMarkedContent' }])).toBe('Hello');
  });
});
