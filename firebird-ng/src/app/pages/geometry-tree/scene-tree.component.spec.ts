import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SceneTreeComponent } from './scene-tree.component';

describe('GeometryTreeComponent', () => {
  let component: SceneTreeComponent;
  let fixture: ComponentFixture<SceneTreeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SceneTreeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SceneTreeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
