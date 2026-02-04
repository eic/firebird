import { TestBed } from '@angular/core/testing';
import { ThreeService } from './three.service';

describe('ThreeService', () => {
    let service: ThreeService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [ThreeService],
        });
        service = TestBed.inject(ThreeService);
    });

    it('should throw error if container not found when using string id', () => {
        // This test doesn't require WebGL - it fails before renderer creation
        expect(() => service.init('nonexistent-id')).toThrowError(/Container element #nonexistent-id not found/);
    });
});
