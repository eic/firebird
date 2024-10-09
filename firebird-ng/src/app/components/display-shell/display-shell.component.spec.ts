import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DisplayShellComponent } from './display-shell.component';

describe('DisplayShellComponent', () => {
  let component: DisplayShellComponent;
  let fixture: ComponentFixture<DisplayShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DisplayShellComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(DisplayShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
