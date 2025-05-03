import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ObjectRaycastComponent } from './object-raycast.component';

describe('ObjectRaycastComponent', () => {
  let component: ObjectRaycastComponent;
  let fixture: ComponentFixture<ObjectRaycastComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectRaycastComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ObjectRaycastComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
