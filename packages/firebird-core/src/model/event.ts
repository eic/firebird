import {EventPiece, getEventPieceFactory} from "./event-piece";

export class Event
{
  id: string = "";
  pieces: EventPiece[] = [];

  toDexObject(): any {
    const objPieces: any[] = [];
    for (const piece of this.pieces) {
      objPieces.push(piece.toDexObject());
    }
    return {
      id: this.id,
      pieces: objPieces,
    };
  }

  static fromDexObject(obj: any): Event {
    let result = new Event();
    result.id = obj["id"];
    for(const objPiece of obj["pieces"]) {
      const pieceType = objPiece["type"];

      if(!pieceType) {
        console.warn(`A problem with event piece type (a required field). It is: '${pieceType}'`);
        continue;
      }

      const factory = getEventPieceFactory(pieceType);
      if(factory === null || factory === undefined ) {
        console.warn(`Can't find EventPiece factory for type name: '${pieceType}'`)
      }
      else {
        result.pieces.push(factory.fromDexObject(objPiece));
      }
    }
    return result;
  }

  /**
   * Calculates the global time range across all pieces with valid time ranges.
   * @returns A tuple [minTime, maxTime] or null if no piece has a valid time range.
   */
  get timeRange(): [number, number] | null {
    let minTime: number | null = null;
    let maxTime: number | null = null;
    let hasValidTimeRange = false;

    // Iterate through all pieces
    for (const piece of this.pieces) {
      const pieceTimeRange = piece.timeRange;

      // Skip pieces with null time range
      if (pieceTimeRange === null) continue;

      const [pieceMinTime, pieceMaxTime] = pieceTimeRange;

      // Initialize min/max times if this is the first valid piece
      if (!hasValidTimeRange) {
        minTime = pieceMinTime;
        maxTime = pieceMaxTime;
        hasValidTimeRange = true;
        continue;
      }

      // Update min/max values
      if (pieceMinTime < minTime!) {
        minTime = pieceMinTime;
      }

      if (pieceMaxTime > maxTime!) {
        maxTime = pieceMaxTime;
      }
    }

    // Return the range if at least one piece had a valid time range
    if (hasValidTimeRange && minTime !== null && maxTime !== null) {
      return [minTime, maxTime];
    }

    return null;
  }
}
