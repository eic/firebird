// box-hit.group.spec.ts

import { BoxHitGroup, BoxHit } from './box-hit.group';
import { initGroupFactories } from "./default-group-init";

describe('BoxHitGroup', () => {
    initGroupFactories();

    it('should create an instance with given name', () => {
        const component = new BoxHitGroup('TestComponent');

        expect(component.name).toBe('TestComponent');
        expect(component.type).toBe(BoxHitGroup.type);
        expect(component.hits.length).toBe(0);
    });

    it('should serialize to DexObject correctly', () => {
        const hit1 = new BoxHit([1, 2, 3], [10, 10, 1], [4, 1], [0.001, 0.0001]);
        const hit2 = new BoxHit([4, 5, 6], [10, 10, 2], [5, 1], [0.002, 0.0002]);

        const component = new BoxHitGroup('TestComponent', 'Testorigin');
        component.hits.push(hit1, hit2);

        const dexObject = component.toDexObject();

        expect(dexObject).toEqual({
            name: 'TestComponent',
            type: 'BoxHit',
            origin: 'Testorigin',
            hits: [hit1.toDexObject(), hit2.toDexObject()],
        });
    });


    describe('BoxHitGroup timeRange', () => {
        let component: BoxHitGroup;

        beforeEach(() => {
            component = new BoxHitGroup('TestComponent');
        });

        it('should return null when hits array is empty', () => {
            expect(component.timeRange).toBeNull();
        });

        it('should return correct time range with a single hit with valid time', () => {
            const hit = new BoxHit([1, 2, 3], // position
            [10, 10, 1], // dimensions
            [5, 1], // time [value, error]
            [0.001, 0.0001] // energyDeposit
            );
            component.hits.push(hit);

            expect(component.timeRange).toEqual([5, 5]);
        });


        it('should return correct time range with multiple hits with valid times', () => {
            const hit1 = new BoxHit([1, 2, 3], [10, 10, 1], [5, 1], [0.001, 0.0001]);
            const hit2 = new BoxHit([4, 5, 6], [10, 10, 2], [3, 1], [0.002, 0.0002]);
            const hit3 = new BoxHit([7, 8, 9], [10, 10, 3], [8, 1], [0.003, 0.0003]);

            component.hits.push(hit1, hit2, hit3);

            expect(component.timeRange).toEqual([3, 8]);
        });

        it('should handle null time values correctly when first hit has valid time', () => {
            const hit1 = new BoxHit([1, 2, 3], [10, 10, 1], [5, 1], [0.001, 0.0001]);

            const hit3 = new BoxHit([7, 8, 9], [10, 10, 3], [3, 1], [0.003, 0.0003]);

            component.hits.push(hit1, hit3);

            expect(component.timeRange).toEqual([3, 5]);
        });




        it('should return correct range when all times are the same', () => {
            const hit1 = new BoxHit([1, 2, 3], [10, 10, 1], [5, 1], [0.001, 0.0001]);
            const hit2 = new BoxHit([4, 5, 6], [10, 10, 2], [5, 1], [0.002, 0.0002]);

            component.hits.push(hit1, hit2);

            expect(component.timeRange).toEqual([5, 5]);
        });
    });
});
