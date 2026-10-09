import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DataCatalogEntry } from '@dexvis/firebird-core';
import { ResourceSelectComponent } from '../resource-select/resource-select.component';
import { DataCatalogService, DataSelectionService } from '@dexvis/firebird-ng/api';

/**
 * Presets tab: pick a catalog entry by name. The entry sets geometry and
 * events at once. The drop-down opens on the entry that matches what is
 * configured, when there is one.
 */
@Component({
  selector: 'firebird-presets-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResourceSelectComponent],
  template: `
    <div class="tab-block">
      <firebird-resource-select
        [options]="names()"
        [selected]="fieldSeed"
        label="Preset"
        (valueChange)="onNameChange($event)">
      </firebird-resource-select>

      @if (selected(); as entry) {
        <div class="description">
          @if (entry.description) {
            <p>{{ entry.description }}</p>
          }
          @if (entry.link) {
            <a [href]="entry.link" target="_blank" rel="noopener">More about this dataset</a>
          }
          <dl class="sources">
            @if (entry.geometry) {
              <dt>Geometry</dt><dd [title]="entry.geometry">{{ entry.geometry }}</dd>
            }
            <dt>Events</dt><dd [title]="entry.events ?? ''">{{ entry.events || 'none' }}</dd>
          </dl>
        </div>
      }
    </div>
  `,
  styles: `
    @use './shared';

    .tab-block {
      @include shared.tab-block;
    }

    .description {
      @include shared.description;

      p {
        margin: 0 0 6px;
      }
    }

    .sources {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 2px 10px;
      margin: 8px 0 0;
      font-size: 0.72rem;

      dt {
        opacity: 0.7;
      }

      dd {
        margin: 0;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: monospace;
      }
    }
  `,
})
export class PresetsTabComponent {
  private readonly catalog = inject(DataCatalogService);
  private readonly selection = inject(DataSelectionService);

  readonly names = computed(() => this.catalog.entries().map(entry => entry.name));
  /** The entry matching the typed name (drives the description), or null while typing. */
  readonly selected = signal<DataCatalogEntry | null>(this.selection.activeEntry());
  /**
   * Text the field starts with. A constant, not a binding to `selected`: a
   * live binding would flip to '' on the first keystroke (no exact match yet)
   * and wipe what the user is typing.
   */
  readonly fieldSeed = this.selected()?.name ?? '';

  onNameChange(name: string): void {
    const entry = this.catalog.entries().find(candidate => candidate.name === name) ?? null;
    this.selected.set(entry);
    if (entry) {
      this.selection.updateDraft(this.selection.selectionForEntry(entry));
    }
  }
}
