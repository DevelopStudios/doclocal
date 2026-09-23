import { isOverviewQuestion } from './question-kind';

describe('isOverviewQuestion', () => {
  it.each([
    'Summarize this document',
    'What are the key points?',
    'Give me a summary',
    'What is this document about?',
    'Can you give an overview?',
    'What are the main ideas here?',
    'tl;dr',
  ])('treats "%s" as a whole-document question', q => {
    expect(isOverviewQuestion(q)).toBe(true);
  });

  it.each([
    'What are the 3 questions a good resume should answer?',
    'What is the purpose of a resume?',
    'What are the key skills employers look for?',
    'Summarize the section on objective statements',
  ])('treats "%s" as a specific question', q => {
    expect(isOverviewQuestion(q)).toBe(false);
  });
});
