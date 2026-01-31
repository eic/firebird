import { TestBed } from '@angular/core/testing';
import { NgZone } from '@angular/core';
import { ThreeService } from './three.service';
import * as THREE from 'three';

/**
 * Helper function to check if WebGL is available in the current environment.
 * Returns true if WebGL can be used, false otherwise (e.g., in headless Chrome).
 */
function isWebGLAvailable(): boolean {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        return gl !== null;
    }
    catch (e) {
        return false;
    }
}

describe('ThreeService', () => {
    let service: ThreeService;
    let ngZone: NgZone;
    let testContainer: HTMLElement;
    let webGLAvailable: boolean;

    beforeAll(() => {
        webGLAvailable = isWebGLAvailable();
        if (!webGLAvailable) {
            console.warn('WebGL is not available in this environment. Some ThreeService tests will be skipped.');
        }
    });

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
        // This test doesn't require WebGL - it fails before renderer creation
        expect(() => service.init('nonexistent-id')).toThrowError(/Container element #nonexistent-id not found/);
    });

    it.skip('should initialize scene, camera, renderer, and controls when provided an HTMLElement', () => {
        if (!webGLAvailable) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('WebGL not available in this environment');
            ;
            return;
        }
        service.init(testContainer);
        expect(service.scene).toBeDefined();
        expect(service.renderer).toBeDefined();
        expect(service.controls).toBeDefined();
        // Check that the renderer's DOM element was appended to the container
        expect(testContainer.contains(service.renderer.domElement)).toBe(true);
    });

    it.skip('should update camera aspect when setSize is called', () => {
        if (!webGLAvailable) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('WebGL not available in this environment');
            ;
            return;
        }
        service.init(testContainer);
        service.setSize(1000, 1000);
        expect(service['perspectiveCamera'].aspect).toBeCloseTo(1, 0.1);
    });

    it.skip('should start and then stop the rendering loop', () => {
        if (!webGLAvailable) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('WebGL not available in this environment');
            ;
            return;
        }
        service.init(testContainer);
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
            return 123; // dummy id
        });
        service.startRendering();
        expect((service as any).shouldRender).toBe(true);
        service.stopRendering();
        expect((service as any).shouldRender).toBe(false);
    });

    it.skip('should add and remove frame callbacks correctly', () => {
        if (!webGLAvailable) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('WebGL not available in this environment');
            ;
            return;
        }
        service.init(testContainer);
        const callback = vi.fn();
        service.addFrameCallback(callback);
        expect((service as any).frameCallbacks).toContain(callback);
        service.removeFrameCallback(callback);
        expect((service as any).frameCallbacks).not.toContain(callback);
    });

    it.skip('toggleOrthographicView should switch between cameras', () => {
        if (!webGLAvailable) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('WebGL not available in this environment');
            ;
            return;
        }
        service.init(testContainer);
        const initialCamera = service.camera;
        service.toggleOrthographicView(true);
        expect(service.camera).not.toBe(initialCamera);
        service.toggleOrthographicView(false);
        expect(service.camera).toBe(service['perspectiveCamera']);
    });
});
