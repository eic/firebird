import { TestBed } from '@angular/core/testing';
import { NgZone } from '@angular/core';
import { ThreeService } from './three.service';
import * as THREE from 'three';

describe('ThreeService', () => {
  let service: ThreeService;
  let ngZone: NgZone;
  let testContainer: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ThreeService],
    });
    service = TestBed.inject(ThreeService);
    ngZone = TestBed.inject(NgZone);

    // Create a dummy container element for testing
    testContainer = document.createElement('div');
    testContainer.style.width = '800px';
    testContainer.style.height = '600px';
    document.body.appendChild(testContainer);
  });

  afterEach(() => {
    // Cleanup: remove the test container and stop rendering
    if (testContainer.parentNode) {
      testContainer.parentNode.removeChild(testContainer);
    }
    service.stopRendering();
  });

  it('should throw error if container not found when using string id', () => {
    expect(() => service.init('nonexistent-id')).toThrowError(/Container element #nonexistent-id not found/);
  });

  it('should initialize scene, camera, renderer, and controls when provided an HTMLElement', () => {
    service.init(testContainer);
    expect(service.scene).toBeDefined();
    expect(service.renderer).toBeDefined();
    expect(service.controls).toBeDefined();
    // Check that the renderer’s DOM element was appended to the container
    expect(testContainer.contains(service.renderer.domElement)).toBeTrue();
  });

  it('should update camera aspect when setSize is called', () => {
    service.init(testContainer);
    const initialAspect = service['perspectiveCamera'].aspect;
    service.setSize(1024, 768);
    expect(service['perspectiveCamera'].aspect).toBeCloseTo(1024 / 768, 2);
    expect(service['perspectiveCamera'].aspect).not.toEqual(initialAspect);
  });

  it('should start and then stop the rendering loop', () => {
    service.init(testContainer);
    spyOn(window, 'requestAnimationFrame').and.callFake((cb: FrameRequestCallback) => {
      return 123; // dummy id
    });
    service.startRendering();
    expect((service as any).shouldRender).toBeTrue();
    service.stopRendering();
    expect((service as any).shouldRender).toBeFalse();
  });

  it('should add and remove frame callbacks correctly', () => {
    service.init(testContainer);
    const callback = jasmine.createSpy('callback');
    service.addFrameCallback(callback);
    expect((service as any).frameCallbacks).toContain(callback);
    service.removeFrameCallback(callback);
    expect((service as any).frameCallbacks).not.toContain(callback);
  });

  it('toggleOrthographicView should switch between cameras', () => {
    service.init(testContainer);
    const initialCamera = service.camera;
    service.toggleOrthographicView(true);
    expect(service.camera).not.toBe(initialCamera);
    service.toggleOrthographicView(false);
    expect(service.camera).toBe(service['perspectiveCamera']);
  });
});
