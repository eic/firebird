import {ThreeService} from "../services/three.service";
import {Entry} from "../model/entry";

export class DataModelPainter {
  private threeService: ThreeService|null = null;
  private entry: Entry|null = null;

  public constructor() {
  }

  public setThree(three: ThreeService) {
    this.threeService = three;
  }

  public setEntry(entry: Entry): void {


  }

  public paint(time: number|null): void {

  }
}


