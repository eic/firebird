
import {Entry} from "./entry";

export class DataExchange  {

  version: string = "0.01"
  origin: any = {}
  entries: Entry[] = []


  toDexObject() {
    let objEntries:any[] = [];
    for(const entry of this.entries) {
      objEntries.push(entry.toDexObject());
    }
    return {
      version: this.version,
      origin: this.origin,
      entries: objEntries
    }
  }

  static fromDexObj(obj: any): DataExchange {
    let result = new DataExchange();
    result.version = obj["version"];
    result.origin = obj["origin"];
    for(const objEntry of obj["entries"]) {
      result.entries.push(Entry.fromDexObject(objEntry));
    }
    return result;
  }
}
