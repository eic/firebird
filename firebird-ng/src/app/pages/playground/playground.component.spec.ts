import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlaygroundComponent } from './playground.component';

/**
 * Helper function to check if WebGL is available in the current environment.
 * Returns true if WebGL can be used, false otherwise (e.g., in headless Chrome).
 */
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return gl !== null;
  } catch (e) {
    return false;
  }
}

describe('PlaygroundComponent', () => {
  let component: PlaygroundComponent;
  let fixture: ComponentFixture<PlaygroundComponent>;
  let webGLAvailable: boolean;

  beforeAll(() => {
    webGLAvailable = isWebGLAvailable();
    if (!webGLAvailable) {
      console.warn('WebGL is not available in this environment. PlaygroundComponent tests will be skipped.');
    }
  });

  beforeEach(async () => {
    if (!webGLAvailable) {
      return;
    }

    await TestBed.configureTestingModule({
      imports: [PlaygroundComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlaygroundComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    if (!webGLAvailable) {
      pending('WebGL not available in this environment');
      return;
    }
    expect(component).toBeTruthy();
  });
});
