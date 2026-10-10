import { Injectable, signal } from '@angular/core';

/**
 * The two bits of state the header and the rail both have to agree on.
 *
 * Held in memory and nowhere else, deliberately -- the same choice the theme makes (a
 * plain signal, no storage). A rail that reopened collapsed on a fresh visit would hide
 * the Hosted shelf's four lines and the document's name from someone who never asked for
 * that, and the empty state is the first thing a visitor sees. Reloading is the reset.
 */
@Injectable({ providedIn: 'root' })
export class ShellState {
  /** Narrow the rail to an icon-only column. */
  readonly railCollapsed = signal(false);

  /**
   * The open document's filename, or null. The header shows it while the rail is
   * collapsed, because collapsed there is no text on screen saying which document is
   * open. The workspace owns it and clears it when it is destroyed.
   */
  readonly documentName = signal<string | null>(null);

  toggleRail(): void {
    this.railCollapsed.update((collapsed) => !collapsed);
  }
}
