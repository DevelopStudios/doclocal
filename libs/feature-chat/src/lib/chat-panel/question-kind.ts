const OVERVIEW = /\b(summari[sz]e|summary|overview|tl;?dr|key points|main points|main ideas|key takeaways)\b/i;
const ABOUT_DOC = /\bwhat(?:'s| is) (?:this|the) (?:document|pdf|file|paper|deck|presentation) about\b/i;
// "summarize the section on X", "summary of X": a narrower question, which similarity search handles.
const NARROWED = /\b(section|part|chapter|page|slide)\b|\b(?:about|on|of|regarding)\s+(?!(?:this|the|it)\b)\w/i;

/** Whether a question is about the whole document rather than a specific topic in it. */
export function isOverviewQuestion(question: string): boolean {
  if (ABOUT_DOC.test(question)) return true;
  return OVERVIEW.test(question) && !NARROWED.test(question);
}
