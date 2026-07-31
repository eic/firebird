// box-hit.group.ts

import { EventGroup, EventGroupFactory, registerEventGroupFactory } from './event-group';

/**
 * Represents an individual tracker hit with position, dimensions, time, and energy deposit.
 */
export class BoxHit {

  /** The position of the hit [mm] as [x, y, z]. */
  position: [number, number, number];

  /** The dimensions of the hit box [mm] as [dx, dy, dz]. */
  dimensions: [number, number, number];

  /** The time information [ns] as [time, err_time]. */
  time: [number, number];

  /** The energy deposit with error [GeV] as [edep, err_edep]. */
  energyDeposit: [number, number];

  /**
   * Constructs a new BoxHit instance.
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
   * Serializes the BoxHit instance into a JSON-compatible object.
   *
   * @returns A JSON-compatible object representing the serialized BoxHit.
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
   * Creates a BoxHit instance from a deserialized object.
   *
   * @param obj - The deserialized object representing a BoxHit.
   * @returns A new instance of BoxHit populated with data from the object.
   */
  static fromDexObject(obj: any): BoxHit {
    return new BoxHit(
      obj["pos"],
      obj["dim"],
      obj["t"],
      obj["ed"]
    );
  }
}

/**
 * Represents a component that contains multiple BoxHits.
 */
export class BoxHitGroup extends EventGroup {

  /** calculate time range */
  override get timeRange(): [number, number] | null {
    if(this.hits.length == 0) return null;
    let minTime = this.hits[0].time[0];
    let maxTime = this.hits[0].time[0];

    for(const hit of this.hits)
    {
      if (hit.time[0] != null && hit.time[0] < minTime) {
        minTime = hit.time[0];
      }

      if (hit.time[0] != null && hit.time[0] > maxTime) {
        maxTime = hit.time[0];
      }
    }

    // Do we have both times?
    if(minTime != null && maxTime!=null) {
      return [minTime, maxTime];
    }

    return null;
  }

  /** The static type identifier for the BoxHitGroup. */
  static type = 'BoxHit';

  /** An array of BoxHits contained in this component. */
  hits: BoxHit[] = [];

  /**
   * Constructs a new BoxHitGroup instance.
   *
   * @param name - The name of the component.
   * @param origin - Optional origin type of the component.
   */
  constructor(name: string, origin?: string) {
    super(name, BoxHitGroup.type, origin);
  }

  /**
   * Serializes the BoxHitGroup instance into a JSON-compatible object.
   *
   * @returns A JSON-compatible object representing the serialized BoxHitGroup.
   */
  toDexObject(): any {
    const objHits = [];
    for (const hit of this.hits) {
      objHits.push(hit.toDexObject());
    }

    return {
      name: this.name,
      type: this.type,
      origin: this.origin,
      hits: objHits,
    };
  }
}

/**
 * Factory for creating instances of BoxHitGroup from deserialized data.
 */
export class BoxHitGroupFactory implements EventGroupFactory {
  /** The type of the component that this factory creates. */
  type: string = BoxHitGroup.type;

  /**
   * Creates an instance of BoxHitGroup from a deserialized object.
   *
   * @param obj - The deserialized object representing a BoxHitGroup.
   * @returns An instance of BoxHitGroup.
   */
  fromDexObject(obj: any): EventGroup {
    const result = new BoxHitGroup(obj["name"]);

    if (obj["origin"]) {
      result.origin = obj["origin"];
    }

    for (const objHit of obj["hits"]) {
      result.hits.push(BoxHit.fromDexObject(objHit));
    }

    return result;
  }
}

// Register the component factory
registerEventGroupFactory(new BoxHitGroupFactory());
