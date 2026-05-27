import { Component, input, output, signal } from '@angular/core';
  import { FormsModule } from '@angular/forms';
  import { IconComponent } from '@doclocal/ui-kit';

  @Component({ 
    selector: 'chat-composer',
    standalone: true,
    imports: [FormsModule, IconComponent],
    styles: [`
      .composer {
        display: flex; align-items: flex-end; gap: 8px;
        background: var(--color-surface); border: 1px solid var(--color-border);
        border-radius: var(--radius-md); padding: 10px 12px;
        transition: border-color 0.15s;
      }
      .composer:focus-within { border-color: var(--color-accent); }
      .composer--disabled { opacity: 0.5; }
      textarea {
        flex: 1; background: transparent; border: none; outline: none;
        resize: none; color: var(--color-text); font-family: var(--font-sans);
        font-size: 14px; line-height: 1.5; max-height: 120px;
      }
      button { 
        background: var(--color-accent); color: #fff; border: none;
        border-radius: var(--radius-sm); padding: 6px 10px; cursor: pointer;
        transition: opacity 0.15s; flex-shrink: 0;
      }
      button:disabled { opacity: 0.4; cursor: default; }
      button:hover:not(:disabled) { opacity: 0.85; }
    `],
    template: `
      <div class="composer" [class.composer--disabled]="disabled()">
        <textarea
          rows="1"
          placeholder="Ask about the document…"
          [disabled]="disabled()"
          [(ngModel)]="text"
          (keydown)="onKeydown($event)"
        ></textarea>  
        <button [disabled]="disabled() || !text().trim()" (click)="submit()">
          <ui-icon name="send" [size]="14" />
        </button>
      </div>
    `,
  })
  export class ComposerComponent {
    disabled = input<boolean>(false);
    submitted = output<string>();
    text = signal('');

    submit() { 
      const value = this.text().trim();
      if (!value || this.disabled()) return;
      this.submitted.emit(value);
      this.text.set('');
    }

    onKeydown(e: KeyboardEvent) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.submit(); }
    }
  }