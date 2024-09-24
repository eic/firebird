import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GeometryTreeComponent } from './geometry-tree.component';

describe('GeometryTreeComponent', () => {
  let component: GeometryTreeComponent;
  let fixture: ComponentFixture<GeometryTreeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GeometryTreeComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(GeometryTreeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
