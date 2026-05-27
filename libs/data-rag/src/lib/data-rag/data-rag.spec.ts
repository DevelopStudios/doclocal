import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataRag } from './data-rag';

describe('DataRag', () => {
  let component: DataRag;
  let fixture: ComponentFixture<DataRag>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataRag],
    }).compileComponents();

    fixture = TestBed.createComponent(DataRag);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
