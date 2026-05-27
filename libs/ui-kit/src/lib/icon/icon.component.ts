import { Component, input } from '@angular/core';

  type IconName = 'file' | 'refresh' | 'sparkle' | 'cpu' | 'lock' | 'send' |
  'chevron-down';
  
  @Component({
    selector: 'ui-icon',
    standalone: true,
    template: `
      <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 16 16"
           fill="none" stroke="currentColor" stroke-width="1.5"
           stroke-linecap="round" stroke-linejoin="round">
        @switch (name()) {
          @case ('file') {
            <path d="M9 1H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6L9 1Z"/>
            <polyline points="9 1 9 6 14 6"/>
          } 
          @case ('refresh') {
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-4.7"/>
          }
          @case ('sparkle') {
            <path d="M8 1v14M1 8h14M4 4l8 8M12 4 4 12"/>
          }
          @case ('cpu') {
            <rect x="4" y="4" width="8" height="8" rx="1"/>
            <path d="M6 1v3M10 1v3M6 12v3M10 12v3M1 6h3M1 10h3M12 6h3M12 10h3"/>
          }
          @case ('lock') {
            <rect x="3" y="7" width="10" height="8" rx="1"/>
            <path d="M5 7V5a3 3 0 0 1 6 0v2"/>
          }
          @case ('send') {
            <line x1="14" y1="2" x2="7" y2="9"/>
            <polygon points="14 2 9 14 7 9 2 7 14 2"/>
          }
          @case ('chevron-down') { 
            <polyline points="4 6 8 10 12 6"/>
          }
        }   
      </svg>
    `,
  })
  export class IconComponent {
    name = input.required<IconName>();
    size = input<number>(16);
  }