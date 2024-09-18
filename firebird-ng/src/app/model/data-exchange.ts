
import {Entry} from "./entry";

export class DataExchange  {

  version: string = "0.01"
  origin: any = {}
  entries: Entry[] = []


  toObj() {
    let objEntries:any[] = [];
    for(const entry of this.entries) {
      objEntries.push(entry.toObj());
    }
    return {
      version: this.version,
      origin: this.origin,
      entries: objEntries
    }
  }

  static fromFirebirdEventObj(obj: any): DataExchange {
    let result = new DataExchange();
    result.version = obj["version"];
    result.origin = obj["origin"];
    for(const objEntry of obj["entries"]) {
      result.entries.push(Entry.fromFirebirdEventObj(objEntry));
    }
    return result;
  }
}
