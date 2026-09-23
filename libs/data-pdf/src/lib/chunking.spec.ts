import { chunkPages } from './chunking';
describe('chunkPages', ()=>{
    it('returns one chunk for short single-page text', () => {
      const result = chunkPages(['hello world'], 512, 64);
      expect(result.length).toBe(1);
      expect(result[0].text).toBe('hello world');
      expect(result[0].pageNumber).toBe(1);
      expect(result[0].id).toBe('chunk-0');
    });
    it('splits long text into overlapping chunks', () => {
      const words = Array.from({ length: 600 }, (_, i) => `word${i}`);
      const result = chunkPages([words.join(' ')], 512, 64);
      expect(result.length).toBeGreaterThan(1);
      const chunk0Words = result[0].text.split(' ');
      const chunk1Words = result[1].text.split(' ');
      expect(chunk1Words.slice(0, 64)).toEqual(chunk0Words.slice(-64));
    });
    
    it('assigns correct page numbers across multiple pages', () => {
      const result = chunkPages(['page one text', 'page two text'], 512, 64);
      expect(result[0].pageNumber).toBe(1);
      expect(result[1].pageNumber).toBe(2);
    });
    
    it('returns empty array for empty input', () => {
      expect(chunkPages([])).toEqual([]);
      expect(chunkPages([''])).toEqual([]);
    });

    it('defaults to passage-sized chunks so a highlight does not cover a whole page', () => {
      const words = Array.from({ length: 400 }, (_, i) => `word${i}`);
      const result = chunkPages([words.join(' ')]);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0].text.split(' ').length).toBe(128);
    });

    it('records the word offset of each chunk within its page', () => {
      const words = Array.from({ length: 300 }, (_, i) => `word${i}`);
      const result = chunkPages([words.join(' '), 'second page'], 128, 32);
      expect(result.map(c => c.startWord)).toEqual([0, 96, 192, 0]);
      expect(result[1].text.split(' ')[0]).toBe('word96');
    });
})
