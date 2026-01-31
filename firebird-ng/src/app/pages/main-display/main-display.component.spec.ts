import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MainDisplayComponent } from './main-display.component';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

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

describe('MainDisplayComponent', () => {
    let component: MainDisplayComponent;
    let fixture: ComponentFixture<MainDisplayComponent>;
    let webGLAvailable: boolean;

    beforeAll(() => {
        webGLAvailable = isWebGLAvailable();
        if (!webGLAvailable) {
            console.warn('WebGL is not available in this environment. MainDisplayComponent tests will be skipped.');
        }
    });

    beforeEach(async () => {
        if (!webGLAvailable) {
            return;
        }

        await TestBed.configureTestingModule({
            imports: [MainDisplayComponent],
            providers: [
                provideRouter([]),
                provideHttpClient(),
                provideHttpClientTesting(),
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(MainDisplayComponent);
        component = fixture.componentInstance;

        // Disable auto-loading of geometry/events to speed up tests
        component.isAutoLoadOnInit = false;

        fixture.detectChanges();
    });

    it.skip('should create', () => {
        if (!webGLAvailable) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('WebGL not available in this environment');
            ;
            return;
        }
        expect(component).toBeTruthy();
    });
});
