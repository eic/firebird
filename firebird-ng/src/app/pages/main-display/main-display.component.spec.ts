import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MainDisplayComponent } from './main-display.component';
import { provideRouter } from '@angular/router';
import {HttpClientTestingModule} from "@angular/common/http/testing";

describe('MainDisplayComponent', () => {
  let component: MainDisplayComponent;
  let fixture: ComponentFixture<MainDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MainDisplayComponent, HttpClientTestingModule,],
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
