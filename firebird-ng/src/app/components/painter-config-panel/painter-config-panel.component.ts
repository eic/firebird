import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  untracked,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { Listbox, Option } from '@angular/aria/listbox';

import {
  EventPiece,
  PainterConfigDescriptor,
  PiecePainterConstructor,
  painterIdOf,
  painterMetaOf,
} from '@firebird/core';
import { DataModelService } from '../../services/data-model.service';
import { EventDisplayService } from '../../services/event-display.service';
import { PainterConfigService } from '../../services/painter-config.service';
import { SelectionService } from '../../services/selection.service';

/**
 * The painter panel of the right pane: for the piece selected in the model
 * tree (or via a 3D pick) it shows WHICH painter draws the piece and the
 * selected painter's knobs — both auto-rendered from the painter's static
 * meta, no per-painter UI code.
 *
 * Everything routes through config keys (`painters.byPiece.<piece>` and
 * `painters.byPiece.<piece>.<knob>`), so the same state is reachable from
 * yaml/server config, URL deep links and batch scripts; edits here apply
 * live through the painter's `onConfigChanged`.
 *
 * Form plumbing is Signal Forms (`form` + `[formField]`) over a model built
 * from the knob declarations; pickers are Angular Aria listboxes.
 */
@Component({
  selector: 'app-painter-config-panel',
  imports: [FormField, Listbox, Option],
  templateUrl: './painter-config-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./painter-config-panel.component.scss'],
})
export class PainterConfigPanelComponent {
  private dataService = inject(DataModelService);
  private eventDisplay = inject(EventDisplayService);
  private painterConfig = inject(PainterConfigService);
  public selection = inject(SelectionService);

  /** The piece the panel configures (from the shared selection). */
  piece = computed<EventPiece | null>(() => {
    const pieceName = this.selection.selectedPiece();
    if (!pieceName) return null;
    return this.dataService.currentEntry()?.pieces.find(piece => piece.name === pieceName) ?? null;
  });

  /** Painter classes registered for the piece's type. */
  candidates = computed<readonly PiecePainterConstructor[]>(() => {
    const piece = this.piece();
    return piece ? this.eventDisplay.paintersForType(piece.type) : [];
  });

  painterOptions = computed(() => this.candidates().map(candidate => ({
    id: painterIdOf(candidate),
    label: painterMetaOf(candidate)?.label ?? painterIdOf(candidate),
  })));

  /** The selected painter id (reactive through the selection config key). */
  selectedPainterId = computed<string | null>(() => {
    const piece = this.piece();
    const candidates = this.candidates();
    if (!piece || candidates.length === 0) return null;
    return this.painterConfig.selectionProperty(piece.name, candidates).valueSignal();
  });

  /** Aria listbox holds selections as arrays; resets when the piece changes. */
  painterListboxValue = linkedSignal<string[]>(() => {
    const id = this.selectedPainterId();
    return id ? [id] : [];
  });

  private selectedPainterClass = computed<PiecePainterConstructor | null>(() => {
    const id = this.selectedPainterId();
    return this.candidates().find(candidate => painterIdOf(candidate) === id)
      ?? this.candidates()[0]
      ?? null;
  });

  /** Knob declarations of the selected painter. */
  descriptors = computed<readonly PainterConfigDescriptor[]>(() =>
    painterMetaOf(this.selectedPainterClass() ?? undefined as never)?.configs ?? []);

  /** The declared config properties behind the knobs. */
  private knobProperties = computed(() => {
    const piece = this.piece();
    const painterClass = this.selectedPainterClass();
    if (!piece || !painterClass) return new Map<string, import('../../utils/config-property').ConfigProperty<unknown>>();
    return this.painterConfig.knobProperties(piece, painterClass);
  });

  /**
   * Signal Forms model over the knob values. linkedSignal: recomputes from
   * the config properties (so URL/server/other-writer changes reach the
   * form), stays writable (so form edits land here first).
   */
  formModel = linkedSignal<Record<string, unknown>>(() => {
    const model: Record<string, unknown> = {};
    for (const [key, property] of this.knobProperties()) {
      model[key] = property.valueSignal();
    }
    return model;
  });

  /** The Signal Forms field tree the inputs bind to via [formField]. */
  panelForm = form(this.formModel);

  constructor() {
    // Form edits -> config writes. The write triggers the painter's live
    // restyle (EventDisplayService watches the knob keys). Values coming
    // back through the linkedSignal recompute equal the written ones, so
    // this settles without loops.
    effect(() => {
      const values = this.formModel();
      const properties = untracked(() => this.knobProperties());
      for (const [key, property] of properties) {
        if (!(key in values)) continue;
        const value = this.coerceLike(values[key], property.value);
        if (value !== property.value) {
          property.setValue(value);
        }
      }
    });
  }

  /** Field of one knob for [formField] binding. */
  field(key: string) {
    return (this.panelForm as unknown as Record<string, unknown>)[key] as never;
  }

  onPainterPicked(ids: string[]): void {
    const piece = this.piece();
    const candidates = this.candidates();
    if (!piece || ids.length === 0) return;
    this.painterConfig.selectionProperty(piece.name, candidates).setValue(ids[0]);
  }

  /** Knob listboxes: single-select over the descriptor options. */
  knobListboxValue(key: string): unknown[] {
    const value = this.formModel()[key];
    return value === undefined ? [] : [value];
  }

  onKnobOptionPicked(key: string, values: unknown[]): void {
    if (values.length === 0) return;
    this.formModel.update(model => ({ ...model, [key]: values[0] }));
  }

  onRangeInput(key: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.formModel.update(model => ({ ...model, [key]: value }));
  }

  /** Which control a descriptor renders as. */
  controlKind(descriptor: PainterConfigDescriptor): 'options' | 'range' | 'color' | 'checkbox' | 'text' {
    if (descriptor.options?.length) return 'options';
    if (typeof descriptor.default === 'number') return 'range';
    if (typeof descriptor.default === 'boolean') return 'checkbox';
    if (typeof descriptor.default === 'string' && descriptor.default.startsWith('#')) return 'color';
    return 'text';
  }

  knobValue(key: string): unknown {
    return this.formModel()[key];
  }

  optionLabel(option: unknown): string {
    return String(option);
  }

  /** Coerces form strings back to the property's type (number inputs). */
  private coerceLike(value: unknown, sample: unknown): unknown {
    if (typeof sample === 'number' && typeof value === 'string') {
      const parsed = Number(value);
      return isNaN(parsed) ? value : parsed;
    }
    return value;
  }
}
