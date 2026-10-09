import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { AUTH_API_BASE_URL } from '@doclocal/data-auth';
import { BackendService } from '@doclocal/data-backend';

import { apiBaseUrl } from './api-config';
import { routes } from './app.routes';
import { LocalBackend } from './local-backend/local-backend';
import { isLocalMode } from './local-mode';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // Both the sign-in and the document API are reached on this base.
    { provide: AUTH_API_BASE_URL, useValue: apiBaseUrl },
    // On-device mode answers from `data-rag` + `data-webllm` and calls no hosted route.
    // `LocalBackend` matches the surface the chat panel uses; the cast is only needed
    // because `BackendService`'s private fields make the two structurally distinct.
    ...(isLocalMode()
      ? [
          LocalBackend,
          {
            provide: BackendService,
            useExisting: LocalBackend as unknown as typeof BackendService,
          },
        ]
      : []),
  ],
};
