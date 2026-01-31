import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SceneTreeComponent } from './scene-tree.component';
import { HttpClientModule } from "@angular/common/http";

describe('GeometryTreeComponent', () => {
    let component: SceneTreeComponent;
    let fixture: ComponentFixture<SceneTreeComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [SceneTreeComponent, HttpClientModule]
        })
            .compileComponents();

        fixture = TestBed.createComponent(SceneTreeComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
