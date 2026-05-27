import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataWebllm } from './data-webllm';

describe('DataWebllm', () => {
  let component: DataWebllm;
  let fixture: ComponentFixture<DataWebllm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataWebllm],
    }).compileComponents();

    fixture = TestBed.createComponent(DataWebllm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
