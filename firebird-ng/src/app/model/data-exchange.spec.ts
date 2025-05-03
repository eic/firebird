// data-exchange.spec.ts

import { DataExchange } from './data-exchange';
import { Event } from './event';
import { BoxHitGroup, BoxHit, BoxHitGroupFactory } from './box-hit.group';
import {_resetEventGroupRegistry, registerEventGroupFactory} from './event-group';

// Register the BoxHitComponentFactory


describe('DataExchange with BoxHitGroup', () => {
  it('should serialize and deserialize correctly', () => {
    // Create hits
    const hit1 = new BoxHit([1, 2, 3], [10, 10, 1], [4, 1], [0.001, 0.0001]);
    const hit2 = new BoxHit([4, 5, 6], [10, 10, 2], [5, 1], [0.002, 0.0002]);

    // Create component
    const component = new BoxHitGroup('TestComponent', 'Testorigin');
    component.hits.push(hit1, hit2);

    // Create entry
    const entry = new Event();
    entry.id = 'event1';
    entry.groups.push(component);

    // Create DataExchange
    const dataExchange = new DataExchange();
    dataExchange.version = '0.01';
    dataExchange.origin = { fileName: 'sample.dat' };
    dataExchange.events.push(entry);

    _resetEventGroupRegistry();
    registerEventGroupFactory(new BoxHitGroupFactory());

    // Serialize
    const serialized = dataExchange.toDexObject();

    // Deserialize
    const deserialized = DataExchange.fromDexObj(serialized);

    // Assertions
    expect(deserialized.version).toBe(dataExchange.version);
    expect(deserialized.origin).toEqual(dataExchange.origin);
    expect(deserialized.events.length).toBe(1);

    const deserializedEntry = deserialized.events[0];
    expect(deserializedEntry.id).toBe(entry.id);
    expect(deserializedEntry.groups.length).toBe(1);

    const deserializedComponent = deserializedEntry.groups[0] as BoxHitGroup;
    expect(deserializedComponent.name).toBe(component.name);
    expect(deserializedComponent.type).toBe(component.type);
    expect(deserializedComponent.origin).toBe(component.origin);
    expect(deserializedComponent.hits.length).toBe(2);

    // Check hits
    for (let i = 0; i < deserializedComponent.hits.length; i++) {
      const originalHit = component.hits[i];
      const deserializedHit = deserializedComponent.hits[i];

      expect(deserializedHit.position).toEqual(originalHit.position);
      expect(deserializedHit.dimensions).toEqual(originalHit.dimensions);
      expect(deserializedHit.time).toEqual(originalHit.time);
      expect(deserializedHit.energyDeposit).toEqual(originalHit.energyDeposit);
    }
  });
});
