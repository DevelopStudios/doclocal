# DocLocal

A fully local PDF chat assistant. Drop in a PDF, ask questions, get answers with inline citations — no API keys, no server, no data leaving your machine. Inference runs in the browser via WebGPU.

## Features

- **Local LLM** — runs entirely in-browser using [WebLLM](https://github.com/mlc-ai/web-llm) and WebGPU
- **RAG pipeline** — documents are chunked and embedded locally via a Web Worker using [@huggingface/transformers](https://github.com/huggingface/transformers.js)
- **PDF viewer** — renders document text with highlighted citation passages
- **Heat minimap** — shows which pages are most relevant to the current question
- **Citation chips** — hover over `[1]` references to preview the source excerpt
- **Three themes** — dark, light, mono

## Requirements

- A browser with WebGPU support (Chrome 113+, Edge 113+)
- Node 18+

## Getting started

```bash
npm install
npm start
```

Open `http://localhost:4200`, wait for the model to finish loading (~30 seconds on first run), then drop in a PDF.

## Scripts

| Command | Description |
|---|---|
| `npm start` | Dev server at `localhost:4200` |
| `npm run build` | Production build to `dist/` |
| `npm test` | Unit tests via Jest |

## Project structure

```
libs/
  data-pdf/        # PDF parsing and chunking (pdfjs-dist)
  data-rag/        # Embedding and cosine-similarity search (Web Worker)
  data-webllm/     # LLM inference service (Web Worker)
  feature-chat/    # Chat panel, message renderer, composer
  feature-pdf-viewer/  # PDF viewer, upload dropzone, heat minimap
  ui-kit/          # Shared components: StatusChip, Icon
src/
  app/             # App shell, layout, theme switching
```

## Tech stack

- Angular 20 (standalone components, signals)
- NX monorepo
- [WebLLM](https://github.com/mlc-ai/web-llm) — WebGPU LLM inference
- [@huggingface/transformers](https://github.com/huggingface/transformers.js) — local embeddings
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — PDF parsing
- Jest — unit tests
