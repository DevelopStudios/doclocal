import { cosineSimilarity } from './cosine';
  
  describe('cosineSimilarity', () => {
    it('returns 1.0 for identical vectors', () => {
      const v = new Float32Array([1, 2, 3]);
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
    });

    it('returns 0.0 for orthogonal vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([0, 1, 0]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
    });

    it('returns -1.0 for opposite vectors', () => {
      const a = new Float32Array([1, 0]);
      const b = new Float32Array([-1, 0]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
    });

    it('returns 0 for a zero vector', () => {
      const zero = new Float32Array([0, 0, 0]);
      const v = new Float32Array([1, 2, 3]);
      expect(cosineSimilarity(zero, v)).toBe(0);
    });
  });