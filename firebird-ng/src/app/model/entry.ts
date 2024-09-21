import {EntryComponent, EntryComponentFactory, getComponentFactory} from "./entry-component";

export class Entry
{
  id: string = "";
  components: EntryComponent[] = [];

  toDexObject(): any {
    const objComponents: any[] = [];
    for (const component of this.components) {
      objComponents.push(component.toDexObject());
    }
    return {
      id: this.id,
      components: objComponents,
    };
  }

  static fromDexObject(obj: any): Entry {
    let result = new Entry();
    result.id = obj["id"];
    for(const objComponent of obj["components"]) {
      const compType = objComponent["type"];

      if(!compType) {
        console.warn(`A problem with entry component type (a required field). It is: '${compType}'`);
        continue;
      }

      const factory = getComponentFactory(compType);
      if(factory === null || factory === undefined ) {
        console.warn(`Can't find EntryComponent factory for type name: '${compType}'`)
      }
      else {
        result.components.push(factory.fromDexObject(objComponent));
      }
    }
    return result;
  }
}
