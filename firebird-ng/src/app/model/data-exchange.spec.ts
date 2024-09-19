// data-exchange.spec.ts

import { DataExchange } from './data-exchange';
import { Entry } from './entry';
import { BoxTrackerHitComponent, BoxTrackerHit, BoxTrackerHitComponentFactory } from './box-tracker-hit.component';
import { registerComponentFactory } from './entry-component';

// Register the BoxTrackerHitComponentFactory
registerComponentFactory(new BoxTrackerHitComponentFactory());

describe('DataExchange with BoxTrackerHitComponent', () => {
  it('should serialize and deserialize correctly', () => {
    // Create hits
    const hit1 = new BoxTrackerHit([1, 2, 3], [10, 10, 1], [4, 1], [0.001, 0.0001]);
    const hit2 = new BoxTrackerHit([4, 5, 6], [10, 10, 2], [5, 1], [0.002, 0.0002]);

    // Create component
    const component = new BoxTrackerHitComponent('TestComponent', 'TestOriginType');
    component.hits.push(hit1, hit2);

    // Create entry
    const entry = new Entry();
    entry.id = 'event1';
    entry.components.push(component);

    // Create DataExchange
    const dataExchange = new DataExchange();
    dataExchange.version = '0.01';
    dataExchange.origin = { fileName: 'sample.dat' };
    dataExchange.entries.push(entry);

    // Serialize
    const serialized = dataExchange.toDexObject();

    // Deserialize
    const deserialized = DataExchange.fromDexObj(serialized);

    // Assertions
    expect(deserialized.version).toBe(dataExchange.version);
    expect(deserialized.origin).toEqual(dataExchange.origin);
    expect(deserialized.entries.length).toBe(1);

    const deserializedEntry = deserialized.entries[0];
    expect(deserializedEntry.id).toBe(entry.id);
    expect(deserializedEntry.components.length).toBe(1);

    const deserializedComponent = deserializedEntry.components[0] as BoxTrackerHitComponent;
    expect(deserializedComponent.name).toBe(component.name);
    expect(deserializedComponent.type).toBe(component.type);
    expect(deserializedComponent.originType).toBe(component.originType);
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
