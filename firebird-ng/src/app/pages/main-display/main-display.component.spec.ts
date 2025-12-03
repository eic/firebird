import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MainDisplayComponent } from './main-display.component';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('MainDisplayComponent', () => {
  let component: MainDisplayComponent;
  let fixture: ComponentFixture<MainDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MainDisplayComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MainDisplayComponent);
    component = fixture.componentInstance;

    // Disable auto-loading of geometry/events to speed up tests
    component.isAutoLoadOnInit = false;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
