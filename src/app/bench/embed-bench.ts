import { Component, signal } from '@angular/core';
import { chunkPages } from '@doclocal/data-pdf';
import { cosineSimilarity } from '@doclocal/data-rag';

/**
 * Dev-only embedder benchmark (`?bench=embed`), for issue #62.
 *
 * Retrieval is the ceiling on the free tier: no model can cite a page retrieval never
 * returned. This scores candidate embedders on the shared `evaluation/` fixtures rather
 * than by feel, holding chunking and scoring fixed and varying only the embedder.
 *
 * The metric is deliberately stricter than the backend's `retrieval_hit_rate`, which keys
 * off the pages the model *cited* and so mixes retrieval with generation. Here there is no
 * model in the loop, so a difference can only come from the embedder.
 *
 * It is also stricter than #62 asks for, because hit@5 on these fixtures decides nothing:
 * chunked 128/32 the three documents come to 6, 3 and 2 chunks, so top-5 returns the whole
 * document for two of them and every candidate scores a perfect hit rate. Instead the
 * corpus is pooled across all three documents — a question must beat the other documents'
 * chunks too, as it would in one real multi-page PDF — and scored by rank: hit@1 and MRR
 * separate models that top-k cannot.
 */
interface Candidate {
  id: string;
  dtype: 'fp32' | 'q8';
  /** BGE/E5-style models are trained with an asymmetric query prefix; without it recall drops. */
  queryPrefix?: string;
}

interface Row {
  label: string;
  dims: number | null;
  hitAt1: string;
  hitAt3: string;
  mrr: string;
  embedMs: string;
  bytes: string;
  error?: string;
}

const CANDIDATES: Candidate[] = [
  { id: 'Xenova/all-MiniLM-L6-v2', dtype: 'fp32' },
  { id: 'Xenova/all-MiniLM-L6-v2', dtype: 'q8' },
  { id: 'Xenova/gte-small', dtype: 'q8' },
];

/** Embedding time swung 2.5x between runs, so each candidate is timed repeatedly. */
const REPEATS = 5;

interface Fixture {
  documents: { id: string; pages: string[] }[];
  questions: {
    id: string;
    document: string;
    question: string;
    answerable: boolean;
    expected_pages: number[];
  }[];
}

@Component({
  selector: 'app-embed-bench',
  standalone: true,
  template: `
    <section class="bench">
      <h2>Embedder benchmark <small>#62 · dev only</small></h2>
      <p class="sub">
        {{ questionCount() }} answerable questions over {{ docCount() }} documents
        ({{ chunkCount() }} chunks pooled into one corpus, chunked 128/32 as in production).
        A hit is the expected page of the expected document; ranked by cosine, no model in
        the loop. hit@5 is omitted on purpose: two of these documents are smaller than 5
        chunks, so top-5 returns everything and every model scores perfectly.
      </p>

      <button type="button" (click)="run()" [disabled]="running()">
        {{ running() ? 'Running…' : 'Run benchmark' }}
      </button>
      @if (running()) { <span class="state">{{ progress() }}</span> }

      @if (rows().length) {
        <table>
          <thead>
            <tr>
              <th>model</th><th>dims</th><th>hit&#64;1</th><th>hit&#64;3</th>
              <th>MRR</th><th>embed ms median (min–max)</th><th>download</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.label) {
              <tr [class.baseline]="r.label.includes('MiniLM')">
                <td>{{ r.label }}</td>
                <td>{{ r.dims ?? '—' }}</td>
                <td>{{ r.hitAt1 }}</td>
                <td>{{ r.hitAt3 }}</td>
                <td>{{ r.mrr }}</td>
                <td>{{ r.embedMs }}</td>
                <td>{{ r.bytes }}</td>
              </tr>
              @if (r.error) {
                <tr><td colspan="7" class="err">{{ r.error }}</td></tr>
              }
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: [
    `
      .bench { padding: 1rem 1.25rem; font: 14px/1.5 ui-sans-serif, system-ui; max-width: 62rem; }
      h2 small { opacity: 0.6; font-weight: 400; }
      .sub { opacity: 0.75; max-width: 46rem; }
      table { border-collapse: collapse; margin-top: 1rem; width: 100%; }
      th, td { text-align: left; padding: 0.35rem 0.7rem; border-bottom: 1px solid currentColor; }
      th { opacity: 0.7; font-weight: 600; }
      td { font-variant-numeric: tabular-nums; }
      .baseline { opacity: 0.75; }
      .err { color: crimson; }
      .state { margin-left: 0.75rem; opacity: 0.8; }
    `,
  ],
})
export class EmbedBench {
  readonly running = signal(false);
  readonly progress = signal('');
  readonly rows = signal<Row[]>([]);
  readonly questionCount = signal(0);
  readonly docCount = signal(0);
  readonly chunkCount = signal(0);
  /** Per-question rank of the first correct chunk, so a one-question spread can be inspected. */
  readonly detail = signal<Record<string, Record<string, number>>>({});

  private fixture: Fixture | null = null;

  private async fixtures(): Promise<Fixture> {
    if (!this.fixture) {
      this.fixture = (await (await fetch('/evaluation-fixtures.json')).json()) as Fixture;
      this.docCount.set(this.fixture.documents.length);
      this.questionCount.set(this.fixture.questions.filter(q => q.answerable).length);
    }
    return this.fixture;
  }

  async run(): Promise<void> {
    this.running.set(true);
    this.rows.set([]);
    try {
      const fixture = await this.fixtures();
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;

      for (const candidate of CANDIDATES) {
        const label = `${candidate.id.replace('Xenova/', '')} ${candidate.dtype}${
          candidate.queryPrefix ? ' +query-prefix' : ''
        }`;
        this.progress.set(`loading ${label}…`);
        const row = await this.score(candidate, label, fixture, pipeline);
        this.rows.update(all => [...all, row]);
      }
    } finally {
      this.running.set(false);
      this.progress.set('');
    }
  }

  private async score(
    candidate: Candidate,
    label: string,
    fixture: Fixture,
    pipeline: typeof import('@huggingface/transformers').pipeline,
  ): Promise<Row> {
    try {
      const extract = (await pipeline('feature-extraction', candidate.id, {
        dtype: candidate.dtype,
      })) as unknown as (t: string[], o: unknown) => Promise<{ tolist: () => number[][] }>;

      const embed = async (texts: string[]): Promise<Float32Array[]> => {
        const out = await extract(texts, { pooling: 'mean', normalize: true });
        return out.tolist().map(v => Float32Array.from(v));
      };

      // One pooled corpus: a question competes against every other document's chunks too,
      // which is what retrieval inside a single multi-page PDF actually looks like.
      const corpus = fixture.documents.flatMap(doc =>
        chunkPages(doc.pages).map(chunk => ({ docId: doc.id, page: chunk.pageNumber, text: chunk.text })),
      );
      this.chunkCount.set(corpus.length);

      const texts = corpus.map(c => c.text);
      const timings: number[] = [];
      let vectors: Float32Array[] = [];
      for (let run = 0; run < REPEATS; run++) {
        this.progress.set(`${label}: embedding ${corpus.length} chunks (${run + 1}/${REPEATS})…`);
        const started = performance.now();
        vectors = await embed(texts);
        timings.push(performance.now() - started);
      }
      timings.sort((a, b) => a - b);
      const embedMs = timings[Math.floor(timings.length / 2)];
      const spread = `${timings[0].toFixed(0)}–${timings[timings.length - 1].toFixed(0)}`;
      const dims = vectors[0]?.length ?? null;

      const questions = fixture.questions.filter(q => q.answerable);
      let hits1 = 0;
      let hits3 = 0;
      let reciprocal = 0;

      for (const q of questions) {
        const [queryVec] = await embed([(candidate.queryPrefix ?? '') + q.question]);
        const ranked = corpus
          .map((chunk, i) => ({ ...chunk, score: cosineSimilarity(queryVec, vectors[i]) }))
          .sort((a, b) => b.score - a.score);
        const expected = new Set(q.expected_pages);
        // A correct chunk is the right page of the right document.
        const rank = ranked.findIndex(r => r.docId === q.document && expected.has(r.page)) + 1;
        this.detail.update(all => ({ ...all, [label]: { ...(all[label] ?? {}), [q.id]: rank } }));
        if (rank === 1) hits1++;
        if (rank >= 1 && rank <= 3) hits3++;
        if (rank >= 1) reciprocal += 1 / rank;
      }

      const asked = questions.length;
      return {
        label,
        dims,
        hitAt1: `${hits1}/${asked}`,
        hitAt3: `${hits3}/${asked}`,
        mrr: (reciprocal / asked).toFixed(3),
        embedMs: `${embedMs.toFixed(0)} (${spread})`,
        bytes: await this.cachedBytes(candidate.id, candidate.dtype),
      };
    } catch (e) {
      return {
        label,
        dims: null,
        hitAt1: '—',
        hitAt3: '—',
        mrr: '—',
        embedMs: '—',
        bytes: '—',
        error: (e as Error).message,
      };
    }
  }

  /**
   * Weight size from Cache Storage, where transformers.js keeps them. Resource timing
   * reports 0 for these: they are cross-origin and HuggingFace sends no Timing-Allow-Origin,
   * so the sizes have to be read back from the cache rather than measured on the wire.
   *
   * Filtered by dtype, because one model's fp32 and quantised weights live side by side
   * under the same id -- summing both reports a download nobody actually makes.
   */
  private async cachedBytes(modelId: string, dtype: Candidate['dtype']): Promise<string> {
    const quantised = (url: string) => /quantized|_q8|_int8|uint8/i.test(url);
    const weights = (url: string) => /\.onnx(_data)?$/.test(url);
    try {
      const cache = await caches.open('transformers-cache');
      const requests = await cache.keys();
      let total = 0;
      for (const request of requests) {
        const url = request.url;
        if (!url.includes(modelId)) continue;
        // Config and tokenizer files are shared; weights belong to one dtype only.
        if (weights(url) && quantised(url) !== (dtype === 'q8')) continue;
        const response = await cache.match(request);
        if (response) total += (await response.clone().blob()).size;
      }
      return total > 0 ? `${(total / 1024 / 1024).toFixed(1)} MB` : 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
