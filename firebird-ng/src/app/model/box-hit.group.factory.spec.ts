// box-hit.group.factory.spec.ts

import { BoxHitGroupFactory, BoxHitGroup } from './box-hit.group';
import { EventGroup } from './event-group';

describe('BoxHitComponentFactory', () => {
  const factory = new BoxHitGroupFactory();

  it('should have the correct type', () => {
    expect(factory.type).toBe('BoxHit');
  });

  it('should create a BoxHitGroup from DexObject', () => {
    const dexObject = {
      name: 'TestComponent',
      type: 'BoxHit',
      origin: 'Testorigin',
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

    const component = factory.fromDexObject(dexObject) as BoxHitGroup;

    expect(component).toBeInstanceOf(BoxHitGroup);
    expect(component.name).toBe('TestComponent');
    expect(component.type).toBe('BoxHit');
    expect(component.origin).toBe('Testorigin');
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
