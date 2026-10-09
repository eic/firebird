// data-exchange.spec.ts

import { DataExchange } from './data-exchange';
import { Event } from './event';
import { BoxHitPiece, BoxHitPieceFactory } from './box-hit.piece';
import { _resetEventPieceRegistry, registerEventPieceFactory } from './event-piece';

describe('DataExchange with BoxHitPiece', () => {
  it('should serialize and deserialize correctly', () => {
    // Create a columnar piece: two hits, id == index
    const piece = new BoxHitPiece('TestPiece', 'TestOrigin');
    piece.count = 2;
    piece.pos = Float32Array.from([1, 2, 3, 4, 5, 6]);
    piece.dim = Float32Array.from([10, 10, 1, 10, 10, 2]);
    piece.time = Float32Array.from([4, 5]);
    piece.timeError = Float32Array.from([1, 1]);
    piece.edep = Float32Array.from([0.25, 0.5]);
    piece.edepError = Float32Array.from([0.125, 0.25]);

    const entry = new Event();
    entry.id = 'event1';
    entry.pieces.push(piece);

    const dataExchange = new DataExchange();
    dataExchange.origin = { fileName: 'sample.dat' };
    dataExchange.events.push(entry);

    _resetEventPieceRegistry();
    registerEventPieceFactory(new BoxHitPieceFactory());

    // Serialize
    const serialized = dataExchange.toDexObject();
    expect(serialized.type).toBe('firebird-dex-json');
    expect(serialized.version).toBe('1.0');

    // Deserialize
    const deserialized = DataExchange.fromDexObj(serialized);

    // Assertions
    expect(deserialized.version).toBe('1.0');
    expect(deserialized.origin).toEqual(dataExchange.origin);
    expect(deserialized.events.length).toBe(1);

    const deserializedEntry = deserialized.events[0];
    expect(deserializedEntry.id).toBe(entry.id);
    expect(deserializedEntry.pieces.length).toBe(1);

    const deserializedPiece = deserializedEntry.pieces[0] as BoxHitPiece;
    expect(deserializedPiece.name).toBe(piece.name);
    expect(deserializedPiece.type).toBe(piece.type);
    expect(deserializedPiece.origin).toBe(piece.origin);
    expect(deserializedPiece.count).toBe(2);
    expect(Array.from(deserializedPiece.pos)).toEqual(Array.from(piece.pos));
    expect(Array.from(deserializedPiece.dim)).toEqual(Array.from(piece.dim));
    expect(Array.from(deserializedPiece.time!)).toEqual(Array.from(piece.time!));
    expect(Array.from(deserializedPiece.edep!)).toEqual(Array.from(piece.edep!));
  });

  it('rejects non-1.0 documents with a pointer to the upgrade command', () => {
    const old = { type: 'firebird-dex-json', version: '0.04', events: [] };
    expect(() => DataExchange.fromDexObj(old)).toThrow(/pyrobird upgrade/);
    expect(() => DataExchange.fromDexObj({ events: [] })).toThrow(/Unsupported DEX version/);
  });
});
