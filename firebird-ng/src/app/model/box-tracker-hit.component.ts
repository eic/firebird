// box-tracker-hit.component.ts

import { EntryComponent, EntryComponentFactory, registerComponentFactory } from './entry-component';

/**
 * Represents an individual tracker hit with position, dimensions, time, and energy deposit.
 */
export class BoxTrackerHit {

  /** The position of the hit [mm] as [x, y, z]. */
  position: [number, number, number];

  /** The dimensions of the hit box [mm] as [dx, dy, dz]. */
  dimensions: [number, number, number];

  /** The time information [ns] as [time, err_time]. */
  time: [number, number];

  /** The energy deposit with error [GeV] as [edep, err_edep]. */
  energyDeposit: [number, number];

  /**
   * Constructs a new BoxTrackerHit instance.
   *
   * @param position - The position of the hit as [x, y, z].
   * @param dimensions - The dimensions of the hit box as [dx, dy, dz].
   * @param time - The time information as [time, err_time].
   * @param energyDeposit - The energy deposit with error as [edep, err_edep].
   */
  constructor(
    position: [number, number, number],
    dimensions: [number, number, number],
    time: [number, number],
    energyDeposit: [number, number]
  ) {
    this.position = position;
    this.dimensions = dimensions;
    this.time = time;
    this.energyDeposit = energyDeposit;
  }

  /**
   * Serializes the BoxTrackerHit instance into a JSON-compatible object.
   *
   * @returns A JSON-compatible object representing the serialized BoxTrackerHit.
   */
  toDexObject(): any {
    return {
      pos: this.position,
      dim: this.dimensions,
      t: this.time,
      ed: this.energyDeposit,
    };
  }

  /**
   * Creates a BoxTrackerHit instance from a deserialized object.
   *
   * @param obj - The deserialized object representing a BoxTrackerHit.
   * @returns A new instance of BoxTrackerHit populated with data from the object.
   */
  static fromDexObject(obj: any): BoxTrackerHit {
    return new BoxTrackerHit(
      obj["pos"],
      obj["dim"],
      obj["t"],
      obj["ed"]
    );
  }
}

/**
 * Represents a component that contains multiple BoxTrackerHits.
 */
export class BoxTrackerHitComponent extends EntryComponent {
  /** The static type identifier for the BoxTrackerHitComponent. */
  static type = 'BoxTrackerHit';

  /** An array of BoxTrackerHits contained in this component. */
  hits: BoxTrackerHit[] = [];

  /**
   * Constructs a new BoxTrackerHitComponent instance.
   *
   * @param name - The name of the component.
   * @param originType - Optional origin type of the component.
   */
  constructor(name: string, originType?: string) {
    super(name, BoxTrackerHitComponent.type, originType);
  }

  /**
   * Serializes the BoxTrackerHitComponent instance into a JSON-compatible object.
   *
   * @returns A JSON-compatible object representing the serialized BoxTrackerHitComponent.
   */
  toDexObject(): any {
    const objHits = [];
    for (const hit of this.hits) {
      objHits.push(hit.toDexObject());
    }

    return {
      name: this.name,
      type: this.type,
      originType: this.originType,
      hits: objHits,
    };
  }
}

/**
 * Factory for creating instances of BoxTrackerHitComponent from deserialized data.
 */
export class BoxTrackerHitComponentFactory implements EntryComponentFactory {
  /** The type of the component that this factory creates. */
  type: string = BoxTrackerHitComponent.type;

  /**
   * Creates an instance of BoxTrackerHitComponent from a deserialized object.
   *
   * @param obj - The deserialized object representing a BoxTrackerHitComponent.
   * @returns An instance of BoxTrackerHitComponent.
   */
  fromDexObject(obj: any): EntryComponent {
    const result = new BoxTrackerHitComponent(obj["name"]);

    if (obj["originType"]) {
      result.originType = obj["originType"];
    }

    for (const objHit of obj["hits"]) {
      result.hits.push(BoxTrackerHit.fromDexObject(objHit));
    }

    return result;
  }
}

// Register the component factory
registerComponentFactory(new BoxTrackerHitComponentFactory());
