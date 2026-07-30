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

    it('should throw error if container not found when using string id', async () => {
        // This test doesn't require WebGPU - it fails before renderer creation
        await expect(service.init('nonexistent-id')).rejects.toThrow(/Container element #nonexistent-id not found/);
    });
});
