import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MainDisplayComponent } from './main-display.component';
import { provideRouter } from '@angular/router';

describe('MainDisplayComponent', () => {
  let component: MainDisplayComponent;
  let fixture: ComponentFixture<MainDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MainDisplayComponent],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(MainDisplayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
