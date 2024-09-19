// box-tracker-hit.component.factory.spec.ts

import { BoxTrackerHitComponentFactory, BoxTrackerHitComponent } from './box-tracker-hit.component';
import { EntryComponent } from './entry-component';

describe('BoxTrackerHitComponentFactory', () => {
  const factory = new BoxTrackerHitComponentFactory();

  it('should have the correct type', () => {
    expect(factory.type).toBe('BoxTrackerHit');
  });

  it('should create a BoxTrackerHitComponent from DexObject', () => {
    const dexObject = {
      name: 'TestComponent',
      type: 'BoxTrackerHit',
      originType: 'TestOriginType',
      hits: [
        {
          pos: [1, 2, 3],
          dim: [10, 10, 1],
          t: [4, 1],
          ed: [0.001, 0.0001],
        },
        {
          pos: [4, 5, 6],
          dim: [10, 10, 2],
          t: [5, 1],
          ed: [0.002, 0.0002],
        },
      ],
    };

    const component = factory.fromDexObject(dexObject) as BoxTrackerHitComponent;

    expect(component).toBeInstanceOf(BoxTrackerHitComponent);
    expect(component.name).toBe('TestComponent');
    expect(component.type).toBe('BoxTrackerHit');
    expect(component.originType).toBe('TestOriginType');
    expect(component.hits.length).toBe(2);

    const hit1 = component.hits[0];
    expect(hit1.position).toEqual([1, 2, 3]);
    expect(hit1.dimensions).toEqual([10, 10, 1]);
    expect(hit1.time).toEqual([4, 1]);
    expect(hit1.energyDeposit).toEqual([0.001, 0.0001]);

    const hit2 = component.hits[1];
    expect(hit2.position).toEqual([4, 5, 6]);
    expect(hit2.dimensions).toEqual([10, 10, 2]);
    expect(hit2.time).toEqual([5, 1]);
    expect(hit2.energyDeposit).toEqual([0.002, 0.0002]);
  });
});
