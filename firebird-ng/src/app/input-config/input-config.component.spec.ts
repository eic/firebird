import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { InputConfigComponent } from './input-config.component';
import { provideRouter } from '@angular/router';


describe('InputConfigComponent', () => {
  let component: InputConfigComponent;
  let fixture: ComponentFixture<InputConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputConfigComponent],
      providers: [provideRouter([
        {
          path: 'display',
          loadComponent: () => import('../main-display/main-display.component').then(m => m.MainDisplayComponent)
        },
      ])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(InputConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
