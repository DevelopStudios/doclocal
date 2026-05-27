import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataPdf } from './data-pdf';

describe('DataPdf', () => {
  let component: DataPdf;
  let fixture: ComponentFixture<DataPdf>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataPdf],
    }).compileComponents();

    fixture = TestBed.createComponent(DataPdf);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
