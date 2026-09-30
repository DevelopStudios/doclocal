// Angular dev-server proxy (`npm start`). Reads DOCLOCAL_BACKEND_TOKEN / DOCLOCAL_BACKEND_URL from
// this Node process only; see tools/dev-proxy/backend-proxy.mjs and the README.
import { createBackendProxyConfig } from './tools/dev-proxy/backend-proxy.mjs';

export default createBackendProxyConfig(process.env);
