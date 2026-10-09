/**
 * SelectionService routes the one selection (piece name, entity index) both
 * ways: a 3D pick resolves the picked object to its entity through the
 * painter's stamp, and a selection made anywhere highlights the entity
 * through the painter that drew it. Hover highlights travel the same route
 * and never take the highlight away from the selected entity.
 */
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Group, Mesh, Object3D } from 'three';
import type { EntityRef } from '@dexvis/firebird-core';
import { SelectionService } from './selection.service';
import { ThreeService } from './three.service';
import { EventDisplayService } from './event-display.service';
import { DataModelService } from './data-model.service';

type Picked = { track: Object3D; intersection?: unknown };

/** Records highlight calls as 'piece#index' strings, in order. */
class PainterStub {
  readonly calls: string[] = [];
  constructor(private readonly pieceName: string) {}
  highlightEntity(index: number): void { this.calls.push(`+${this.pieceName}#${index}`); }
  unhighlightEntity(index: number): void { this.calls.push(`-${this.pieceName}#${index}`); }
}

/** A mesh stamped the way EventPiecePainter.registerEntityObject stamps it. */
function stampedMesh(pieceName: string, entityIndex: number): Mesh {
  const mesh = new Mesh();
  mesh.userData['pieceName'] = pieceName;
  mesh.userData['entityIndex'] = entityIndex;
  return mesh;
}

describe('SelectionService', () => {
  let selection: SelectionService;
  let clicked: Subject<Picked>;
  let hovered: Subject<Picked | null>;
  let invalidate: ReturnType<typeof vi.fn>;
  let currentEntry: ReturnType<typeof signal<unknown>>;
  let hits: PainterStub;
  let tracks: PainterStub;

  const hit = (entityIndex: number): EntityRef => ({ pieceName: 'Hits', entityIndex });

  beforeEach(() => {
    clicked = new Subject();
    hovered = new Subject();
    invalidate = vi.fn();
    currentEntry = signal<unknown>({ id: 'event_0' });
    hits = new PainterStub('Hits');
    tracks = new PainterStub('Tracks');
    const painters: Record<string, PainterStub> = { Hits: hits, Tracks: tracks };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ThreeService, useValue: { trackClicked: clicked, trackHovered: hovered, invalidate } },
        { provide: EventDisplayService, useValue: { painterFor: (name: string) => painters[name] ?? null } },
        { provide: DataModelService, useValue: { currentEntry } },
      ],
    });
    selection = TestBed.inject(SelectionService);
    TestBed.tick();
  });

  it('selects the entity a 3D click picked, including a child of the stamped object', () => {
    const parent = stampedMesh('Tracks', 4);
    const child = new Group();
    parent.add(child);
    clicked.next({ track: child });

    expect(selection.selection()).toEqual({ pieceName: 'Tracks', entityIndex: 4 });
    expect(selection.selectedPiece()).toBe('Tracks');
    expect(tracks.calls).toEqual(['+Tracks#4']);
    expect(invalidate).toHaveBeenCalled();
  });

  it('ignores a click on an object no painter stamped', () => {
    clicked.next({ track: new Mesh() });
    expect(selection.selection()).toBeNull();
  });

  it('moves the highlight from the previous selection to the new one', () => {
    selection.select(hit(1));
    selection.select({ pieceName: 'Tracks', entityIndex: 2 });

    expect(hits.calls).toEqual(['+Hits#1', '-Hits#1']);
    expect(tracks.calls).toEqual(['+Tracks#2']);
    expect(selection.isSelected('Tracks', 2)).toBe(true);
    expect(selection.isSelected('Hits', 1)).toBe(false);
  });

  it('clears the selection and its highlight', () => {
    selection.select(hit(1));
    selection.clear();
    expect(selection.selection()).toBeNull();
    expect(hits.calls).toEqual(['+Hits#1', '-Hits#1']);
  });

  it('focuses a piece without selecting an entity', () => {
    selection.selectPiece('Tracks');
    expect(selection.selectedPiece()).toBe('Tracks');
    expect(selection.selection()).toBeNull();
  });

  it('highlights the hovered entity and removes the highlight when the pointer leaves', () => {
    hovered.next({ track: stampedMesh('Hits', 3) });
    hovered.next(null);
    expect(hits.calls).toEqual(['+Hits#3', '-Hits#3']);
  });

  it('keeps the selected entity highlighted while the pointer passes over it and others', () => {
    selection.select(hit(1));
    hovered.next({ track: stampedMesh('Hits', 1) });
    hovered.next({ track: stampedMesh('Hits', 2) });
    hovered.next(null);

    // Hovering the selected entity changes nothing; the other entity gets its
    // own highlight; leaving re-highlights the selection (one-slot painters).
    expect(hits.calls).toEqual(['+Hits#1', '+Hits#2', '-Hits#2', '+Hits#1']);
  });

  it('resets the selection when another event is shown', () => {
    selection.select(hit(1));
    currentEntry.set({ id: 'event_1' });
    TestBed.tick();
    expect(selection.selection()).toBeNull();
    expect(selection.selectedPiece()).toBeNull();
  });
});
