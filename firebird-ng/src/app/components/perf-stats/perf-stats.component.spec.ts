import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PerfStatsComponent } from './perf-stats.component';

describe('PerformanceStatsComponent', () => {
    let component: PerfStatsComponent;
    let fixture: ComponentFixture<PerfStatsComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [PerfStatsComponent]
        })
            .compileComponents();

        fixture = TestBed.createComponent(PerfStatsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
