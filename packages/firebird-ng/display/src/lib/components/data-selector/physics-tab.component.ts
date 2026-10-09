import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DataCatalogEntry, DataCatalogFacet, facetValues, matchEntries } from '@dexvis/firebird-core';
import { DataCatalogService, DataSelectionService } from '@dexvis/firebird-ng/api';

interface FacetChip {
  value: string;
  label: string;
  selected: boolean;
  /** False when no entry has this value together with the other selected values. Still clickable. */
  available: boolean;
}

interface FacetRow {
  facet: DataCatalogFacet;
  chips: FacetChip[];
}

/**
 * Physics tab: choose a dataset by its tags — one chip per facet value
 * (process, beam, ...). Chips that lead to no dataset with the other choices
 * are dimmed but stay clickable; a selection that matches nothing says so.
 * Several matches list under the chips, the first one pre-chosen.
 */
@Component({
  selector: 'firebird-physics-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <div class="tab-block">
      @for (row of rows(); track row.facet.key) {
        <div class="facet">
          <span class="facet-label">{{ row.facet.label }}</span>
          <div class="chip-row">
            @for (chip of row.chips; track chip.value) {
              <button type="button"
                      class="chip"
                      [class.selected]="chip.selected"
                      [class.unavailable]="!chip.available"
                      (click)="toggle(row.facet.key, chip.value)">
                {{ chip.label }}
              </button>
            }
          </div>
        </div>
      }

      @if (infos().length) {
        <div class="description">
          @for (info of infos(); track info.key) {
            <p>
              <strong>{{ info.label }}</strong> {{ info.description }}
              @if (info.link) {
                <a [href]="info.link" target="_blank" rel="noopener">More</a>
              }
            </p>
          }
        </div>
      }

      @if (nothingSelected()) {
        <div class="hint">Choose a process or a beam to see the datasets.</div>
      } @else if (matches().length === 0) {
        <div class="hint">No dataset has this combination. Change a choice, or open the Manual tab to load your own file.</div>
      } @else {
        <div class="matches">
          @for (entry of matches(); track entry.name) {
            <label class="match" [class.chosen]="entry === chosen()">
              <input type="radio" name="physics-match" [checked]="entry === chosen()" (change)="choose(entry)"/>
              <span class="match-name">{{ entry.name }}</span>
            </label>
          }
        </div>
        @if (chosen()?.description; as description) {
          <div class="description">{{ description }}</div>
        }
      }
    </div>
  `,
  styles: `
    @use './shared';

    .tab-block {
      @include shared.tab-block;
    }

    .facet {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .facet-label {
      @include shared.section-label;
    }

    .chip-row {
      @include shared.chip-row;
    }

    .chip {
      @include shared.chip;
    }

    .description {
      @include shared.description;

      p {
        margin: 0 0 4px;
      }
    }

    .hint {
      font-size: 0.8rem;
      opacity: 0.8;
    }

    .matches {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .match {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 0.82rem;

      input {
        accent-color: var(--mat-sys-primary, #4bac84);
      }

      &.chosen {
        font-weight: 500;
      }
    }
  `,
})
export class PhysicsTabComponent {
  private readonly catalog = inject(DataCatalogService);
  private readonly selection = inject(DataSelectionService);

  /** Only tagged entries take part; untagged presets are for the Presets tab. */
  readonly entries = computed(() => this.catalog.entries().filter(entry => entry.tags && Object.keys(entry.tags).length > 0));

  /** Starts from the tags of the loaded preset, when there is one. */
  readonly selectedTags = signal<Record<string, string>>({ ...(this.selection.activeEntry()?.tags ?? {}) });
  readonly nothingSelected = computed(() => Object.keys(this.selectedTags()).length === 0);

  readonly rows = computed<FacetRow[]>(() => {
    const entries = this.entries();
    const selected = this.selectedTags();
    return this.catalog.facets()
      .map(facet => ({
        facet,
        chips: facetValues(entries, facet).map(value => ({
          value,
          label: facet.values?.[value]?.label ?? value,
          selected: selected[facet.key] === value,
          available: matchEntries(entries, { ...selected, [facet.key]: value }).length > 0,
        })),
      }))
      .filter(row => row.chips.length > 0);
  });

  /** Descriptions of the selected values that have one. */
  readonly infos = computed(() => {
    const selected = this.selectedTags();
    return this.catalog.facets().flatMap(facet => {
      const value = selected[facet.key];
      const info = value !== undefined ? facet.values?.[value] : undefined;
      if (!info?.description) return [];
      return [{ key: facet.key, label: info.label ?? value, description: info.description, link: info.link }];
    });
  });

  readonly matches = computed<DataCatalogEntry[]>(() =>
    this.nothingSelected() ? [] : matchEntries(this.entries(), this.selectedTags()));

  readonly chosen = signal<DataCatalogEntry | null>(null);

  constructor() {
    // The first match is pre-chosen whenever the match list changes
    effect(() => {
      const matches = this.matches();
      untracked(() => this.choose(matches[0] ?? null));
    });
  }

  toggle(key: string, value: string): void {
    this.selectedTags.update(selected => {
      const next = { ...selected };
      if (next[key] === value) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }

  choose(entry: DataCatalogEntry | null): void {
    this.chosen.set(entry);
    if (entry) {
      this.selection.updateDraft(this.selection.selectionForEntry(entry));
    } else {
      this.selection.clearDraft();
    }
  }
}
