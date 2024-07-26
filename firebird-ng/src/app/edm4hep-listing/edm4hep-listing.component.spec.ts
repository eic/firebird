import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Edm4hepListingComponent } from './edm4hep-listing.component';

describe('Edm4hepListingComponent', () => {
  let component: Edm4hepListingComponent;
  let fixture: ComponentFixture<Edm4hepListingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Edm4hepListingComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(Edm4hepListingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
