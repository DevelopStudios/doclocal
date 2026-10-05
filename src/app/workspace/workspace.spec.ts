import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { PdfService, PdfDocument } from '@doclocal/data-pdf';
import { BackendService } from '@doclocal/data-backend';
import { Workspace } from './workspace';

describe('Workspace (NVIDIA NIM backend)', () => {
  let parse: jasmine.Spy;
  let index: jasmine.Spy;
  let remove: jasmine.Spy;

  beforeEach(() => {
    parse = jasmine.createSpy('parse');
    index = jasmine.createSpy('index').and.returnValue(of(undefined));
    remove = jasmine.createSpy('remove').and.returnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [
        { provide: PdfService, useValue: { parse } },
        {
          provide: BackendService,
          useValue: {
            indexDocument$: index,
            deleteSession$: remove,
            sessionStatus: signal('none'),
            sessionError: signal(null),
            chat$: jasmine.createSpy('chat$'),
          },
        },
      ],
    });
  });

  const chunks = [{ id: 'c0', text: 'Synthetic text', pageNumber: 1, startWord: 0 }];
  const doc = { filename: 'synthetic.pdf', chunks } as unknown as PdfDocument;
  const file = new File(['synthetic'], 'synthetic.pdf');
  const app = () => TestBed.runInInjectionContext(() => new Workspace());

  it('shows the upload with a NIM notice and no mode, token or model-loading UI', () => {
    const fixture = TestBed.createComponent(Workspace);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('pdf-upload-dropzone')).toBeTruthy();
    expect(el.querySelector('[role=note]')?.textContent).toContain('NVIDIA NIM');
    expect(el.querySelector('input[type=password]')).toBeNull();
    expect(el.querySelector('ui-status-chip')).toBeNull();
    expect(el.textContent).not.toMatch(/WebGPU|Change mode|Local \(WebLLM\)/);
  });

  it('parses in the browser and indexes the chunks on the backend', async () => {
    parse.and.resolveTo(doc);
    const instance = app();
    await instance.onFileSelected(file);
    expect(parse).toHaveBeenCalledWith(file);
    expect(index).toHaveBeenCalledWith(chunks);
    expect(instance.doc()).toBe(doc);
    expect(instance.parsing()).toBeFalse();
  });

  it('reports a parse failure without contacting the backend for indexing', async () => {
    parse.and.rejectWith(new Error('Not a PDF'));
    const instance = app();
    await instance.onFileSelected(file);
    expect(instance.parseError()).toBe('Not a PDF');
    expect(index).not.toHaveBeenCalled();
  });

  it('suppresses a parse completing after the document is closed', async () => {
    let finish!: (value: PdfDocument) => void;
    parse.and.returnValue(new Promise<PdfDocument>((resolve) => (finish = resolve)));
    const instance = app();
    const pending = instance.onFileSelected(file);
    instance.replaceDocument();
    finish(doc);
    await pending;
    expect(instance.doc()).toBeNull();
    expect(index).not.toHaveBeenCalled();
    expect(instance.parsing()).toBeFalse();
  });

  it('cancels indexing and deletes the session when the document is replaced', async () => {
    const indexing = new Subject<void>();
    index.and.returnValue(indexing);
    parse.and.resolveTo(doc);
    const instance = app();
    await instance.onFileSelected(file);
    remove.calls.reset();
    instance.replaceDocument();
    expect(indexing.observed).toBeFalse();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(instance.doc()).toBeNull();
  });

  it('shows a cleanup notice when deleting the old session fails', () => {
    remove.and.returnValue(throwError(() => new Error('down')));
    const instance = app();
    instance.replaceDocument();
    expect(instance.parseError()).toContain('expire automatically');
  });

  it('deletes the session on unload and on destroy', () => {
    // Dispatching a real beforeunload would make Karma think the page reloaded.
    const add = spyOn(window, 'addEventListener').and.callThrough();
    const removeListener = spyOn(window, 'removeEventListener').and.callThrough();
    const instance = app();
    instance.ngOnInit();
    const handler = add.calls.allArgs().find(([type]) => type === 'beforeunload')?.[1];
    if (typeof handler !== 'function') return fail('beforeunload handler was not registered');
    handler(new Event('beforeunload'));
    expect(remove).toHaveBeenCalledTimes(1);
    instance.ngOnDestroy();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(removeListener).toHaveBeenCalledWith('beforeunload', handler);
  });
});
