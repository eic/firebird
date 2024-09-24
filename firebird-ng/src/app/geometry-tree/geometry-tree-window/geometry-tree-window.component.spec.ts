import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GeometryTreeWindowComponent } from './geometry-tree-window.component';

describe('GeometryDialogComponent', () => {
  let component: GeometryTreeWindowComponent;
  let fixture: ComponentFixture<GeometryTreeWindowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GeometryTreeWindowComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GeometryTreeWindowComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
