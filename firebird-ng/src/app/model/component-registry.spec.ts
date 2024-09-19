// component-registry.spec.ts

import { registerComponentFactory, getComponentFactory } from './entry-component';
import { BoxTrackerHitComponentFactory } from './box-tracker-hit.component';

describe('Component Registry', () => {
  it('should register and retrieve BoxTrackerHitComponentFactory correctly', () => {
    const factory = new BoxTrackerHitComponentFactory();
    registerComponentFactory(factory);

    const retrievedFactory = getComponentFactory('BoxTrackerHit');

    expect(retrievedFactory).toBeDefined();
    expect(retrievedFactory).toBe(factory);
  });

  it('should return undefined for unregistered component types', () => {
    const retrievedFactory = getComponentFactory('UnknownType');

    expect(retrievedFactory).toBeUndefined();
  });
});
