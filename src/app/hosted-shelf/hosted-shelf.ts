import { Component, input } from '@angular/core';

/**
 * The paid tier, advertised at the bottom of the rail.
 *
 * Two renderings of one thing: a panel listing what Hosted buys while the rail is open,
 * and a single accent circle while it is collapsed. Both are deliberately quiet about
 * being an advertisement -- the panel sits on the page background behind a hairline
 * rather than on a tinted surface, because it must not outrank the answer beside it.
 *
 * The button is genuinely `disabled`, in both renderings. There is no Hosted tier to buy
 * yet, and a button that looks live and silently does nothing is worse than one that is
 * visibly unavailable. The "$XX / month" placeholder is intentional too: there is no
 * price yet, and inventing one would be the only dishonest thing on the page.
 */
@Component({
  selector: 'app-hosted-shelf',
  standalone: true,
  templateUrl: './hosted-shelf.html',
  styleUrl: './hosted-shelf.scss',
})
export class HostedShelf {
  /** Collapsed: the accent circle instead of the panel. */
  collapsed = input<boolean>(false);

  readonly features = [
    { title: 'Tool calling', detail: 'Fill forms, sign, pull fields into a spreadsheet' },
    { title: 'Stronger reasoning', detail: 'Multi-step answers, not just lookups' },
    { title: 'Multiple documents', detail: 'Ask across a whole set of files at once' },
    { title: 'Long documents', detail: 'A 48-page contract read in one pass' },
  ];
}
