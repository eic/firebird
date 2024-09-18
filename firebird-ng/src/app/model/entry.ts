export class Entry
{
  id: string = "";
  components: Component = [];

  toObj() {
    return {}
  }

  static fromFirebirdEventObj(obj: any): void {
    throw new Error("Method not implemented.");
  }
}
