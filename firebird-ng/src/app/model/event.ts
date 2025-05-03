import {EventGroup, EventGroupFactory, getEventGroupFactory} from "./event-group";

export class Event
{
  id: string = "";
  groups: EventGroup[] = [];

  toDexObject(): any {
    const objGroups: any[] = [];
    for (const component of this.groups) {
      objGroups.push(component.toDexObject());
    }
    return {
      id: this.id,
      groups: objGroups,
    };
  }

  static fromDexObject(obj: any): Event {
    let result = new Event();
    result.id = obj["id"];
    for(const objComponent of obj["groups"]) {
      const compType = objComponent["type"];

      if(!compType) {
        console.warn(`A problem with entry component type (a required field). It is: '${compType}'`);
        continue;
      }

      const factory = getEventGroupFactory(compType);
      if(factory === null || factory === undefined ) {
        console.warn(`Can't find EventGroup factory for type name: '${compType}'`)
      }
      else {
        result.groups.push(factory.fromDexObject(objComponent));
      }
    }
    return result;
  }

  /**
   * Calculates the global time range across all components with valid time ranges.
   * @returns A tuple [minTime, maxTime] or null if no component has a valid time range.
   */
  get timeRange(): [number, number] | null {
    let minTime: number | null = null;
    let maxTime: number | null = null;
    let hasValidTimeRange = false;

    // Iterate through all components
    for (const component of this.groups) {
      const componentTimeRange = component.timeRange;

      // Skip components with null time range
      if (componentTimeRange === null) continue;

      const [componentMinTime, componentMaxTime] = componentTimeRange;

      // Initialize min/max times if this is the first valid component
      if (!hasValidTimeRange) {
        minTime = componentMinTime;
        maxTime = componentMaxTime;
        hasValidTimeRange = true;
        continue;
      }

      // Update min/max values
      if (componentMinTime < minTime!) {
        minTime = componentMinTime;
      }

      if (componentMaxTime > maxTime!) {
        maxTime = componentMaxTime;
      }
    }

    // Return the range if at least one component had a valid time range
    if (hasValidTimeRange && minTime !== null && maxTime !== null) {
      return [minTime, maxTime];
    }

    return null;
  }
}
