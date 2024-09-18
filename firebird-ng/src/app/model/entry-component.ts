export abstract class EntryComponent {

  name: string;
  type: string;
  originType?: string;

  constructor(name: string, type: string, originType?: string) {
    this.name = name;
    this.type = type;
    this.originType = originType;
  }

  // Instance method to serialize the object
  abstract toSpecialObject(): any;

}
