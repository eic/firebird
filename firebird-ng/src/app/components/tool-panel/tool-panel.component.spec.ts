import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ToolPanelComponent } from './tool-panel.component';

describe('ToolPanelComponent', () => {
  let component: ToolPanelComponent;
  let fixture: ComponentFixture<ToolPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolPanelComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ToolPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
