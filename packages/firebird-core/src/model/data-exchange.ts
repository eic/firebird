
import {Event} from "./event";

/**
 * A complete DEX document: the object form of a .firebird.json file.
 *
 * Reads and writes DEX version 1.0 only. Older 0.04 files fail loudly with a
 * pointer to the one-shot upgrade command — there is no fallback reader.
 */
export class DataExchange  {

  static readonly supportedVersion = "1.0";

  version: string = DataExchange.supportedVersion;
  origin: any = {}
  events: Event[] = []


  toDexObject() {
    let objEntries:any[] = [];
    for(const entry of this.events) {
      objEntries.push(entry.toDexObject());
    }
    return {
      type: "firebird-dex-json",
      version: this.version,
      origin: this.origin,
      events: objEntries
    }
  }

  static fromDexObj(obj: any): DataExchange {
    const version = String(obj?.["version"] ?? "");
    if (version !== DataExchange.supportedVersion) {
      throw new Error(
        `Unsupported DEX version '${version}': this build reads DEX ${DataExchange.supportedVersion} only. ` +
        `Convert older files once with: pyrobird upgrade <in> <out>`);
    }
    let result = new DataExchange();
    result.version = version;
    result.origin = obj["origin"];
    for(const objEntry of obj["events"]) {
      result.events.push(Event.fromDexObject(objEntry));
    }
    return result;
  }
}
