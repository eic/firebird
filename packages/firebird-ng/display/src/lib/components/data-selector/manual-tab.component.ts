import { ChangeDetectionStrategy, Component, computed, inject, signal, untracked } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import type { DataSource } from '@dexvis/firebird-core';
import { ConfigService } from '@dexvis/app-features';
import {
  DataCatalogService,
  DataSelectionService,
  GEOMETRY_ROOT_FILTER_CONFIG,
  isRootSource,
  OPTIMIZE_EDIT_RULE_SET,
  resolveRootGeometryRules,
  ROOT_GEOMETRY_RULES,
  type RootGeometryEditRuleSet,
} from '@dexvis/firebird-ng/api';
import { FileOpenRouterService } from '../../services/file-open-router.service';
import { RootEventPickerComponent } from './root-event-picker.component';
import { SourcePickerComponent } from './source-picker.component';

/**
 * Manual tab: geometry and events each by URL (a known one from the catalog,
 * or typed) or from a local file. A ROOT event source gets the event-range
 * and collection-group picker under it.
 *
 * A `.root` file holds geometry OR events, and a user does not always know
 * which: every `.root` source is probed through FileOpenRouterService, and one
 * dropped into the wrong field moves to the right one with a note.
 */
@Component({
  selector: 'firebird-manual-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, SourcePickerComponent, RootEventPickerComponent],
  templateUrl: './manual-tab.component.html',
  styleUrl: './manual-tab.component.scss',
})
export class ManualTabComponent {
  private readonly selection = inject(DataSelectionService);
  private readonly catalog = inject(DataCatalogService);
  private readonly router = inject(FileOpenRouterService);
  private readonly config = inject(ConfigService);

  readonly geometryOptions = this.catalog.geometrySources;
  readonly eventOptions = this.catalog.eventSources;

  // Fields start from what is configured; only what the user changes goes to the draft
  readonly geometry = signal<DataSource | ''>(this.selection.configuredGeometry());
  readonly events = signal<DataSource | ''>(this.selection.configuredEvents());
  readonly eventRange = signal(this.selection.configuredEventRange());
  readonly collections = signal(this.selection.configuredCollections());
  readonly note = signal<string | null>(null);
  // Bumped when a typed source leaves a field, so that field shows its value again
  readonly geometryResync = signal(0);
  readonly eventsResync = signal(0);
  readonly eventsIsRoot = computed(() => this.events() !== '' && isRootSource(this.events() as DataSource));

  /**
   * "Optimize geometry" switches config `geometry.rootFilterName` between
   * the edit rule set OPTIMIZE_EDIT_RULE_SET and 'off'; the finer pipeline
   * options stay on the config page. Creation is untracked: declaring a key
   * applies pending layer values (signal writes), which a computed() forbids.
   */
  private readonly rootFilter = untracked(() => this.config.declare(GEOMETRY_ROOT_FILTER_CONFIG));
  readonly optimize = computed(() => this.rootFilter.valueSignal() !== 'off');

  /**
   * The rule set the toggle selects, or null while none is known. Without a
   * pack that registers it the toggle stays hidden: it would select nothing.
   * Rule data may arrive through a dynamic import, so it resolves once here.
   */
  readonly optimizeRuleSet = signal<RootGeometryEditRuleSet | null>(null);

  constructor() {
    const ruleSources = inject(ROOT_GEOMETRY_RULES, { optional: true }) ?? [];
    if (ruleSources.length === 0) return;
    resolveRootGeometryRules(ruleSources).then(
      rules => this.optimizeRuleSet.set(rules.editRules?.[OPTIMIZE_EDIT_RULE_SET] ?? null),
      error => console.error('[DataSelector] Geometry rules failed to load:', error),
    );
  }

  toggleOptimize(): void {
    this.rootFilter.value = this.optimize() ? 'off' : OPTIMIZE_EDIT_RULE_SET;
  }

  onGeometryChange(value: DataSource | ''): void {
    this.note.set(null);
    void this.placeSource(value, 'geometry');
  }

  onEventsChange(value: DataSource | ''): void {
    this.note.set(null);
    void this.placeSource(value, 'events');
  }

  onEventRangeChange(value: string): void {
    this.eventRange.set(value);
    this.selection.updateDraft({ eventRange: value });
  }

  onCollectionsChange(value: string): void {
    this.collections.set(value);
    this.selection.updateDraft({ collections: value });
  }

  /** Bumped per change of each field; a probe for an older value is not applied. */
  private readonly placeTokens = { geometry: 0, events: 0 };

  /**
   * Puts the source into its field — after asking the loaders which field a
   * `.root` source belongs to. Probes run in parallel; when a field changes
   * again before its probe answers, only the latest value is placed.
   */
  private async placeSource(value: DataSource | '', field: 'geometry' | 'events'): Promise<void> {
    const token = ++this.placeTokens[field];
    const isLatest = () => token === this.placeTokens[field];
    let target = field;
    if (value !== '' && isRootSource(value)) {
      try {
        const route = await this.router.route(value);
        if (!isLatest()) return;
        if (route.kind === 'unknown') {
          this.note.set(route.message);
        } else if (route.kind !== field) {
          target = route.kind;
          const name = typeof value === 'string' ? value : value.name;
          this.note.set(`'${name}' holds ${route.kind}, so it went to the ${route.kind} field.`);
          (field === 'geometry' ? this.geometryResync : this.eventsResync).update(token => token + 1);
        }
      } catch (error) {
        if (!isLatest()) return;
        // The probe could not read the file (offline, CORS, server path
        // without pyrobird): keep the value where it was typed, Show still
        // tries the load, and the reason is on screen
        this.note.set(`Could not look inside the file: ${error instanceof Error ? error.message : error}`);
      }
    }
    if (target === 'geometry') {
      this.geometry.set(value);
      this.selection.updateDraft({ geometry: value });
    } else {
      this.events.set(value);
      this.selection.updateDraft({ events: value });
    }
  }
}
