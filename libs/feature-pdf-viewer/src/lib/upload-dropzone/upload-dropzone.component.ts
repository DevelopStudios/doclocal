import { Component, output, signal } from '@angular/core';
  import { IconComponent } from '@doclocal/ui-kit';

  @Component({
    selector: 'pdf-upload-dropzone',
    standalone: true,
    imports: [IconComponent],   
    styles: [`
      .dropzone {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 10px; padding: 64px 48px;
        border-radius: var(--radius-lg); border: 1.5px dashed var(--color-border);
        color: var(--color-text-muted); cursor: default; text-align: center;
        transition: border-color 0.15s, background 0.15s;
      }
      .dropzone--dragging {
        border-color: var(--color-accent);
        background: var(--color-accent-dim);
        color: var(--color-text);
      }
      .dropzone-title { font-size: 15px; font-weight: 500; color: var(--color-text); }
      .dropzone-sub { font-size: 13px; }
      .dropzone-link { color: var(--color-accent); cursor: pointer; text-decoration: 
  underline; }
      .dropzone-error { color: #f87171; font-size: 12px; }
    `],
    template: `
      <div class="dropzone" [class.dropzone--dragging]="dragging()"
           (dragover)="onDragOver($event)"
           (dragleave)="dragging.set(false)"
           (drop)="onDrop($event)">
        <ui-icon name="file" [size]="32" />
        <p class="dropzone-title">Drop a PDF here</p>
        <p class="dropzone-sub">
          or <label class="dropzone-link">browse
            <input type="file" accept=".pdf" (change)="onFileInput($event)" hidden />
          </label>
        </p>
        @if (error()) {
          <p class="dropzone-error">{{ error() }}</p>
        }
      </div>
    `,
  })
  export class UploadDropzoneComponent {
    fileSelected = output<File>();
    dragging = signal(false);
    error = signal<string | null>(null);

    onDragOver(e: DragEvent) {
      e.preventDefault();
      this.dragging.set(true);
    }

    onDrop(e: DragEvent) {
      e.preventDefault();
      this.dragging.set(false);
      this.handleFile(e.dataTransfer?.files[0]);
    }
  
    onFileInput(e: Event) {
      this.handleFile((e.target as HTMLInputElement).files?.[0]);
    }
  
    private handleFile(file: File | undefined) {
      if (!file) return;
      if (file.type !== 'application/pdf') {
        this.error.set('Only PDF files are supported.');
        return;
      }
      this.error.set(null);
      this.fileSelected.emit(file);
    }
  }