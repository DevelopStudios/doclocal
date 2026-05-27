import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeaturePdfViewer } from './feature-pdf-viewer';

describe('FeaturePdfViewer', () => {
  let component: FeaturePdfViewer;
  let fixture: ComponentFixture<FeaturePdfViewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturePdfViewer],
    }).compileComponents();

    fixture = TestBed.createComponent(FeaturePdfViewer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
