import { Injectable, effect, inject, signal } from '@angular/core';
import { EntityRef, entityRefOf } from '@dexvis/firebird-core';
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
 * Hover over event data (opt-in hover picking) routes the same way: the
 * hovered entity is highlighted through its painter, and the selected
 * entity keeps its highlight while the pointer passes over it or others.
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

  /** The entity under the pointer (hover picking), highlighted through its painter. */
  private hovered: EntityRef | null = null;

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

    // 3D hover → painter highlight (null: the pointer left event data).
    this.three.trackHovered.subscribe(picked => {
      this.hover(picked ? entityRefOf(picked.track, picked.intersection) : null);
    });

    // Event switches rebuild all painters — the old selection points into
    // disposed objects, so it resets.
    effect(() => {
      this.dataService.currentEntry();
      this.hovered = null;
      this.selectionSignal.set(null);
      this.selectedPieceSignal.set(null);
    });
  }

  /**
   * Moves the hover highlight to `ref` (null clears it). The selected entity
   * is never unhighlighted by hover, and is re-highlighted when the hover
   * leaves it: a painter may hold a single highlight slot.
   */
  private hover(ref: EntityRef | null): void {
    const previous = this.hovered;
    if (sameEntity(previous, ref)) return;
    this.hovered = ref;
    const selected = this.selectionSignal();
    if (previous && !sameEntity(previous, selected)) {
      this.eventDisplay.painterFor(previous.pieceName)?.unhighlightEntity(previous.entityIndex);
    }
    if (ref && !sameEntity(ref, selected)) {
      this.eventDisplay.painterFor(ref.pieceName)?.highlightEntity(ref.entityIndex);
    }
    if (selected && previous && !ref) {
      this.eventDisplay.painterFor(selected.pieceName)?.highlightEntity(selected.entityIndex);
    }
    // Highlights mutate materials directly — schedule a render.
    this.three.invalidate();
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
    // The previous selection keeps its highlight while it is still hovered.
    if (previous && !sameEntity(previous, ref) && !sameEntity(previous, this.hovered)) {
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

/** True when both refs name the same entity (two nulls count as the same). */
function sameEntity(a: EntityRef | null, b: EntityRef | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.pieceName === b.pieceName && a.entityIndex === b.entityIndex;
}
