import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import {provideRouter} from '@angular/router';
import {Component, NO_ERRORS_SCHEMA} from "@angular/core";

// Mock the external component
@Component({
  selector: 'lib-view-options',  // Replace with the actual selector
  template: '',
})
class MockViewOptionsComponent {}

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      declarations: [MockViewOptionsComponent],
      providers: [provideRouter([])],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'firebird' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    expect(app.title).toEqual('Firebird');
  });

  // it('should render title', () => {
  //   const fixture = TestBed.createComponent(AppComponent);
  //   fixture.detectChanges();
  //   const compiled = fixture.nativeElement as HTMLElement;
  //   expect(compiled.querySelector('h1')?.textContent).toContain('Hello, firebird');
  // });
});
