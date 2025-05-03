
import {Event} from "./event";

export class DataExchange  {

  version: string = "0.04"
  origin: any = {}
  events: Event[] = []


  toDexObject() {
    let objEntries:any[] = [];
    for(const entry of this.events) {
      objEntries.push(entry.toDexObject());
    }
    return {
      version: this.version,
      origin: this.origin,
      events: objEntries
    }
  }

  static fromDexObj(obj: any): DataExchange {
    let result = new DataExchange();
    result.version = obj["version"];
    result.origin = obj["origin"];
    for(const objEntry of obj["events"]) {
      result.events.push(Event.fromDexObject(objEntry));
    }
    return result;
  }
}
