import { Injectable, effect, inject, signal } from '@angular/core';
import { EntityRef, entityRefOf } from '@firebird/core';
import { ThreeService } from './three.service';
import { EventDisplayService } from './event-display.service';
import { DataModelService } from './data-model.service';

/**
 * The one selection of the event display: (piece name, entity index) — the
 * physics identity of the thing the user picked, not a scene object.
 *
 * Both directions run through here:
 * - a 3D click resolves the picked Object3D to its entity (painters stamp
 *   their objects; `entityRefOf` walks up to the stamp) and sets the signal;
 * - panels (model tree, inspectors) call `select()` and the owning painter
 *   highlights its scene objects.
 *
 * Painters own the entity↔object mapping; this service only routes.
 */
@Injectable({
  providedIn: 'root',
})
export class SelectionService {
  private three = inject(ThreeService);
  private eventDisplay = inject(EventDisplayService);
  private dataService = inject(DataModelService);

  private selectionSignal = signal<EntityRef | null>(null);

  /** The current selection, null when nothing is selected. */
  readonly selection = this.selectionSignal.asReadonly();

  private selectedPieceSignal = signal<string | null>(null);

  /**
   * The piece the UI is focused on — set by entity selections (their piece)
   * and by piece-level clicks in the model tree. The painter-config panel
   * shows this piece's painter and knobs.
   */
  readonly selectedPiece = this.selectedPieceSignal.asReadonly();

  constructor() {
    // 3D pick → selection. trackClicked fires for any picked scene object;
    // only objects painters stamped resolve to an entity. The intersection
    // rides along for batched painters, which resolve the entity from the
    // picked segment instead of the object.
    this.three.trackClicked.subscribe(({ track, intersection }) => {
      const ref = entityRefOf(track, intersection);
      if (ref) {
        this.select(ref);
      }
    });

    // Event switches rebuild all painters — the old selection points into
    // disposed objects, so it resets.
    effect(() => {
      this.dataService.currentEntry();
      this.selectionSignal.set(null);
      this.selectedPieceSignal.set(null);
    });
  }

  /** Focuses a piece without selecting an entity (model-tree piece click). */
  selectPiece(pieceName: string | null): void {
    this.selectedPieceSignal.set(pieceName);
  }

  /**
   * Selects one entity (or clears with null). The previously selected
   * entity is unhighlighted and the new one highlighted through its painter.
   */
  select(ref: EntityRef | null): void {
    const previous = this.selectionSignal();
    if (previous && (previous.pieceName !== ref?.pieceName || previous.entityIndex !== ref?.entityIndex)) {
      this.eventDisplay.painterFor(previous.pieceName)?.unhighlightEntity(previous.entityIndex);
    }
    if (ref) {
      this.eventDisplay.painterFor(ref.pieceName)?.highlightEntity(ref.entityIndex);
      this.selectedPieceSignal.set(ref.pieceName);
    }
    this.selectionSignal.set(ref);
    // Highlights mutate materials directly — schedule a render.
    this.three.invalidate();
  }

  clear(): void {
    this.select(null);
  }

  /** True when the given entity is the current selection. */
  isSelected(pieceName: string, entityIndex: number): boolean {
    const current = this.selectionSignal();
    return current !== null && current.pieceName === pieceName && current.entityIndex === entityIndex;
  }
}
