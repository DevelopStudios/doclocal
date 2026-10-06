import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { AUTH_API_BASE_URL } from '@doclocal/data-auth';

import { apiBaseUrl } from './api-config';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // Both the sign-in and the document API are reached on this base.
    { provide: AUTH_API_BASE_URL, useValue: apiBaseUrl },
  ],
};
