import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';

import { EntityRefLink, EventPiece } from '@firebird/core';
import { DataModelService } from '../../services/data-model.service';
import { PainterConfigService } from '../../services/painter-config.service';
import { SelectionService } from '../../services/selection.service';

interface EntityNode {
  index: number;
  label: string;
  refs: EntityRefLink[];
}

/** How many entities a piece shows before the "more" button. */
const ENTITY_PAGE = 200;

/**
 * The physics-oriented tree of the loaded event: Event → pieces → entities,
 * built by walking the data model (never the three.js scene — the scene tree
 * component stays available as the debug view).
 *
 * Entity labels and reference links come from the pieces themselves
 * (`entityLabel` / `entityRefs`), so extension piece types appear here
 * without this component knowing them. Clicking an entity selects it through
 * SelectionService (highlighting it in 3D); a 3D click selects here in
 * return. Reference links navigate to the referenced entity.
 */
@Component({
  selector: 'app-model-tree',
  imports: [MatIcon],
  templateUrl: './model-tree.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./model-tree.component.scss'],
})
export class ModelTreeComponent {
  private dataService = inject(DataModelService);
  private painterConfig = inject(PainterConfigService);
  public selection = inject(SelectionService);

  pieces = computed<EventPiece[]>(() => this.dataService.currentEntry()?.pieces ?? []);

  /** Names of expanded pieces. */
  private expanded = signal<ReadonlySet<string>>(new Set<string>());

  /** Per-piece entity display limits (raised by "more" and by reveals). */
  private limits = signal<Record<string, number>>({});

  /** Built entity rows per piece, dropped when the event changes. */
  private entityCache = new Map<EventPiece, EntityNode[]>();

  constructor() {
    effect(() => {
      this.dataService.currentEntry();
      this.entityCache.clear();
      this.expanded.set(new Set());
      this.limits.set({});
    });

    // Reveal the selection when it arrives from elsewhere (3D click):
    // expand the piece, make sure the row is within the display limit,
    // then scroll it into view.
    effect(() => {
      const selected = this.selection.selection();
      if (!selected) return;
      this.expandPiece(selected.pieceName);
      this.ensureVisible(selected.pieceName, selected.entityIndex);
      setTimeout(() => {
        document.getElementById(this.rowId(selected.pieceName, selected.entityIndex))
          ?.scrollIntoView({ block: 'nearest' });
      });
    });
  }

  isExpanded(pieceName: string): boolean {
    return this.expanded().has(pieceName);
  }

  /**
   * The eye toggle reads/writes the piece visibility config key
   * (`painters.byPiece.<name>.visible`) — the same key deep links and packs
   * set, applied to the 3D scene by EventDisplayService. Reading through the
   * property's signal keeps the icon in sync with changes from anywhere.
   *
   * Property CREATION is untracked: the first declare of a key applies
   * pending layer values (signal writes), which template evaluation — a
   * reactive context — forbids (NG0600).
   */
  private visibilityPropertyOf(pieceName: string) {
    return untracked(() => this.painterConfig.visibilityProperty(pieceName));
  }

  isPieceVisible(pieceName: string): boolean {
    return this.visibilityPropertyOf(pieceName).valueSignal() !== false;
  }

  togglePieceVisibility(pieceName: string): void {
    const property = this.visibilityPropertyOf(pieceName);
    property.value = property.value === false;
  }

  togglePiece(pieceName: string): void {
    const next = new Set(this.expanded());
    if (next.has(pieceName)) {
      next.delete(pieceName);
    } else {
      next.add(pieceName);
    }
    this.expanded.set(next);
  }

  private expandPiece(pieceName: string): void {
    if (this.expanded().has(pieceName)) return;
    const next = new Set(this.expanded());
    next.add(pieceName);
    this.expanded.set(next);
  }

  limitFor(pieceName: string): number {
    return this.limits()[pieceName] ?? ENTITY_PAGE;
  }

  showMore(pieceName: string): void {
    this.limits.update(limits => ({ ...limits, [pieceName]: this.limitFor(pieceName) + ENTITY_PAGE }));
  }

  private ensureVisible(pieceName: string, entityIndex: number): void {
    if (entityIndex >= this.limitFor(pieceName)) {
      this.limits.update(limits => ({ ...limits, [pieceName]: entityIndex + ENTITY_PAGE }));
    }
  }

  /** The visible entity rows of a piece (built once per piece per event). */
  entityNodes(piece: EventPiece): EntityNode[] {
    const limit = Math.min(piece.entityCount, this.limitFor(piece.name));
    let nodes = this.entityCache.get(piece);
    if (!nodes || nodes.length < limit) {
      nodes = [];
      for (let i = 0; i < limit; i++) {
        nodes.push({ index: i, label: piece.entityLabel(i), refs: piece.entityRefs(i) });
      }
      this.entityCache.set(piece, nodes);
    }
    return nodes.length > limit ? nodes.slice(0, limit) : nodes;
  }

  rowId(pieceName: string, entityIndex: number): string {
    return `model-tree-${pieceName}-${entityIndex}`.replace(/\s+/g, '_');
  }

  selectEntity(pieceName: string, entityIndex: number): void {
    this.selection.select({ pieceName, entityIndex });
  }

  followRef(ref: EntityRefLink): void {
    this.selectEntity(ref.targetPiece, ref.targetIndex);
  }
}
