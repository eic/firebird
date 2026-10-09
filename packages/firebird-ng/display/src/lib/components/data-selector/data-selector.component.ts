import {
  ChangeDetectionStrategy,
  Component,
  Type,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { resolveRegistry } from '@dexvis/app-features';
import {
  DATA_SELECTOR_TABS,
  DataCatalogService,
  DataSelection,
  DataSelectionService,
  DataSelectorTabRegistration,
} from '@dexvis/firebird-ng/api';

/**
 * The data selector: one control to choose what the display shows — a named
 * preset, a physics case picked by tags, or geometry and event files by URL
 * or from disk. The display's "open" toolbar panel and the config page both
 * embed it; they differ only in the button caption and in what happens after
 * Show (`applied`): the panel closes, the config page navigates to /display.
 *
 * Tabs come from DI (`withDataSelectorTab`), so an experiment pack can add,
 * replace (same tab id) or drop them (`withoutFeatures('data-selector-tab:<id>')`). A tab reads and writes `DataSelectionService.draft`;
 * this host owns the Show/Cancel buttons and applies the draft through the
 * one shared path (config keys, then a live display reloads).
 */
@Component({
  selector: 'firebird-data-selector',
  templateUrl: './data-selector.component.html',
  styleUrl: './data-selector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet, MatButton, MatIcon],
})
export class DataSelectorComponent {
  /** Caption of the apply button: 'Show' in the display panel, 'Display' on the config page. */
  readonly applyLabel = input('Show');
  /** When false, the apply button is enabled with an unchanged draft (the config page navigates anyway). */
  readonly requireChanges = input(true);
  readonly showCancel = input(true);
  /** The selection that was applied. */
  readonly applied = output<DataSelection>();
  readonly cancelled = output<void>();

  readonly catalog = inject(DataCatalogService);
  readonly selection = inject(DataSelectionService);
  /** One tab per id: a later registration with the id of an earlier one replaces it (tokens.ts). */
  private readonly registeredTabs = resolveRegistry(inject(DATA_SELECTOR_TABS, { optional: true }) ?? [], tab => tab.id);

  /** Registered tabs by `order` (ties: registration order), minus catalog-only tabs when there is no catalog. */
  readonly visibleTabs = computed<DataSelectorTabRegistration[]>(() => {
    const catalogIsEmpty = this.catalog.isEmpty();
    return this.registeredTabs
      .filter(tab => tab.needsCatalog === false || !catalogIsEmpty)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });

  readonly activeTabId = signal<string | null>(null);
  readonly tabComponent = signal<Type<unknown> | null>(null);
  readonly tabError = signal<string | null>(null);

  readonly applyEnabled = computed(() => !this.requireChanges() || this.selection.draftHasChanges());

  constructor() {
    void this.catalog.ensureRemoteLoaded();
    // Keep a valid tab selected as the tab set changes (the remote catalog
    // arriving can reveal Presets/Physics). First choice: Presets when a
    // preset is what is loaded, otherwise Manual, which shows the URLs as is.
    effect(() => {
      const tabs = this.visibleTabs();
      const current = untracked(this.activeTabId);
      if (tabs.some(tab => tab.id === current)) return;
      const preferred = untracked(this.selection.activeEntry)
        ? tabs[0]
        : (tabs.find(tab => tab.id === 'manual') ?? tabs[0]);
      if (preferred) this.selectTab(preferred.id);
    });
  }

  selectTab(id: string): void {
    const tab = this.visibleTabs().find(candidate => candidate.id === id);
    if (!tab || this.activeTabId() === id) return;
    // Each tab starts from the configured state; a half-made choice on
    // another tab must not leak into this one
    this.selection.clearDraft();
    this.activeTabId.set(id);
    this.tabComponent.set(null);
    this.tabError.set(null);
    tab.load().then(
      component => {
        if (this.activeTabId() === id) this.tabComponent.set(component);
      },
      error => {
        console.error(`[DataSelector] tab '${id}' failed to load`, error);
        this.tabError.set(`Tab '${tab.label}' failed to load: ${error instanceof Error ? error.message : error}`);
      },
    );
  }

  apply(): void {
    const draft = this.selection.draft();
    this.selection.apply(draft);
    this.applied.emit(draft);
  }

  cancel(): void {
    this.selection.clearDraft();
    this.cancelled.emit();
  }
}
