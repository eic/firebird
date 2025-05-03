// event-group-registry.spec.ts

import { registerEventGroupFactory, getEventGroupFactory } from './event-group';
import { BoxHitGroupFactory } from './box-hit.group';

describe('Component Registry', () => {
  it('should register and retrieve BoxHitComponentFactory correctly', () => {
    const factory = new BoxHitGroupFactory();
    registerEventGroupFactory(factory);

    const retrievedFactory = getEventGroupFactory('BoxHit');

    expect(retrievedFactory).toBeDefined();
    expect(retrievedFactory).toBe(factory);
  });

  it('should return undefined for unregistered component types', () => {
    const retrievedFactory = getEventGroupFactory('UnknownType');

    expect(retrievedFactory).toBeUndefined();
  });
});
