# DocLocal

A PDF chat assistant. Drop in a PDF, ask questions, get streamed answers with inline citations
that highlight the source passages in the document.

The PDF is parsed and rendered in your browser. **The extracted text and your questions are sent to
NVIDIA NIM** (through the DocLocal backend) for embeddings, retrieval and answers. Use documents you
are comfortable sharing. Browser-local models are deferred; their libraries are kept in `libs/` but
are not part of the app.

## Features

- **NVIDIA NIM backend** — embeddings, retrieval and streamed answers via the
  [DocLocal backend](https://github.com/DevelopStudios/doclocal-backend)
- **PDF viewer** — renders original pages with selectable citation highlights
- **Heat minimap** — shows which pages the current answer cites
- **Citation chips** — hover over `[1]` references to preview the source excerpt
- **Stop, replace, delete** — cancel an answer mid-stream; replacing or closing a document deletes
  its backend session
- **Two themes** — dark (primary) and light, both from one set of design tokens in
  `src/styles.scss`

## Requirements

- Node 20.19+ or 22.12+
- A local checkout of the DocLocal backend (Python 3.12)

## Local setup (two terminals)

The browser only talks to its own origin at `/api`. The Angular dev server proxies `/api` to the
backend on loopback, strips the `/api` prefix and adds `Authorization: Bearer <token>` from the
`DOCLOCAL_BACKEND_TOKEN` environment variable of the Node process. The token is never sent to the
browser, built into the bundle or stored in this repository. The NVIDIA key stays in the backend's
environment.

### Terminal 1 — backend

```sh
cd path/to/doclocal-backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install --require-hashes -r requirements-dev.txt

# Issue a developer token. It prints the raw token (keep it for terminal 2) and a
# `developer:sha256` entry. The backend only stores the hash.
python scripts/new_dev_token.py "$USER"
```

Then start it in **one** of two ways.

**Mock NIM (no NVIDIA key, for local QA):**

```sh
python scripts/mock_nim.py --port 9100 &
NVIDIA_NIM_API_KEY=mock \
NIM_BASE_URL=http://127.0.0.1:9100/v1 \
DEV_ACCESS_TOKENS='<developer:sha256 entry printed above>' \
  uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`mock_nim.py` streams a fixed answer citing `[1]`. `--embed-delay-ms`, `--chat-fail-first` and
`--chat-break-after` simulate slow indexing, 503s and cut streams.

**Real NVIDIA NIM:** put `NVIDIA_NIM_API_KEY` and the `DEV_ACCESS_TOKENS` entry in the backend's
own `.env` (see the backend README), then:

```sh
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`curl http://127.0.0.1:8000/ready` reports whether the backend is configured.

### Terminal 2 — frontend

```sh
cd path/to/doclocal
npm install
read -rs DOCLOCAL_BACKEND_TOKEN && export DOCLOCAL_BACKEND_TOKEN   # paste the raw token, then Enter
npm start
```

Open `http://127.0.0.1:4200` and drop in a PDF.

- `DOCLOCAL_BACKEND_URL` (optional) overrides the backend, default `http://127.0.0.1:8000`. It must
  be plain `http` on `127.0.0.1`, `localhost` or `[::1]` with no path or credentials.
- `npm start` fails immediately with a `[doclocal dev proxy]` message if the token is missing or
  malformed (including the hashed `developer:sha256` entry by mistake) or the URL is invalid.
- The proxy never follows upstream redirects; a redirect is returned to the browser as 502 without
  its `Location`.
- A `401` in the app means the backend rejected the token; `502` means the backend is not running.

## Deployment

`npm run build` produces a static bundle that contains **no** token and calls `/api` on its own
origin. A deployment therefore needs a server-side proxy (or gateway) in front of the backend that
serves the app, forwards `/api/*` to the backend without the prefix and adds credentials on the
server. Do not put `DOCLOCAL_BACKEND_TOKEN` or `NVIDIA_NIM_API_KEY` into the build or any
browser-visible configuration. No such proxy is included here.

## Scripts

| Command              | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| `npm start`          | Dev server at `127.0.0.1:4200` with the `/api` backend proxy   |
| `npm run build`      | Production build to `dist/`                                    |
| `npm test`           | App tests (Karma); `npx nx test <lib>` runs a lib's Jest tests |
| `npm run test:proxy` | Dev proxy tests (`node --test`, uses a fake loopback backend)  |

## Project structure

```
libs/
  data-backend/        # Same-origin /api client: sessions, indexing, SSE chat, cancellation
  data-pdf/            # PDF parsing and chunking (pdfjs-dist)
  data-rag/            # Browser embeddings (deferred, not used by the app)
  data-webllm/         # Browser LLM (deferred, not used by the app)
  feature-chat/        # Chat panel, message renderer, composer
  feature-pdf-viewer/  # PDF viewer, upload dropzone, heat minimap
  ui-kit/              # Shared components: StatusChip, Icon
src/
  app/                 # App shell, layout, theme switching
tools/dev-proxy/       # Dev-server proxy that injects the backend token
proxy.conf.mjs         # Angular dev-server proxy entry point
```

## Tech stack

- Angular 21 (standalone components, signals)
- Nx monorepo
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — PDF parsing and rendering
- DocLocal backend (FastAPI) with NVIDIA NIM
- Jest and Karma — unit tests
