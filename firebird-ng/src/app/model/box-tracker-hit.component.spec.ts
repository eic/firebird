// box-tracker-hit.component.spec.ts

import { BoxTrackerHitComponent, BoxTrackerHit } from './box-tracker-hit.component';
import {initComponentFactories} from "./default-components-init";

describe('BoxTrackerHitComponent', () => {
  initComponentFactories();

  it('should create an instance with given name', () => {
    const component = new BoxTrackerHitComponent('TestComponent');

    expect(component.name).toBe('TestComponent');
    expect(component.type).toBe(BoxTrackerHitComponent.type);
    expect(component.hits.length).toBe(0);
  });

  it('should serialize to DexObject correctly', () => {
    const hit1 = new BoxTrackerHit([1, 2, 3], [10, 10, 1], [4, 1], [0.001, 0.0001]);
    const hit2 = new BoxTrackerHit([4, 5, 6], [10, 10, 2], [5, 1], [0.002, 0.0002]);

    const component = new BoxTrackerHitComponent('TestComponent', 'TestOriginType');
    component.hits.push(hit1, hit2);

    const dexObject = component.toDexObject();

    expect(dexObject).toEqual({
      name: 'TestComponent',
      type: 'BoxTrackerHit',
      originType: 'TestOriginType',
      hits: [hit1.toDexObject(), hit2.toDexObject()],
    });
  });
});
