import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import type { DataSource } from '@dexvis/firebird-core';
import { injectEventLoaders } from '@dexvis/firebird-ng/api';
import { RootFileService } from '../../services/root-file.service';

/** Checkbox captions of the conversion collection groups. */
const GROUP_LABELS: Record<string, string> = {
  tracker_hits: 'Tracker hits',
  tracks: 'Tracks',
  mc_trajectories: 'MC hit trajectories',
  mc_particles: 'MC particles',
};

/**
 * Event numbers and collection groups to convert from a ROOT event source.
 * Opens the file in the converter worker to show its data model and event
 * count (only the header is read; nothing is uploaded), when a registered
 * loader with an event picker claims the source. The picker opens it under
 * its own worker handle, so it never disturbs a conversion the display runs.
 * When the source changes while a file is opening, only the latest source's
 * result is shown. Sources only pyrobird can
 * convert (`root://`) get the range and group inputs without the count.
 *
 * The choice is emitted as the `events.rootEventRange` and
 * `events.rootCollections` values ('' = all groups), the same knobs deep
 * links and `pyrobird convert --collections` use.
 */
@Component({
  selector: 'firebird-root-event-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, MatProgressSpinner],
  template: `
    @if (openedFile(); as file) {
      <div class="file-meta">
        <span class="badge">{{ file.model }}</span>
        <span>{{ file.entryCount }} events</span>
      </div>
    } @else if (busy()) {
      <div class="status busy"><mat-spinner diameter="18"></mat-spinner><span>Reading ROOT file header&hellip;</span></div>
    } @else if (error(); as message) {
      <div class="status error"><mat-icon>error_outline</mat-icon><span>{{ message }}</span></div>
    } @else if (!pickerAvailable()) {
      <div class="status note">Converted by the server when shown; the event count is not known in advance.</div>
    }

    <div class="event-row">
      <label for="root-event-range">Events</label>
      <input id="root-event-range"
             class="event-range-input"
             type="text"
             [value]="eventRange()"
             (input)="onRangeInput($any($event.target).value)"/>
      <span class="range-hint">single, list or range{{ maxEventHint() }} (e.g. <code>0,2,4-5</code>)</span>
    </div>

    <div class="collections-row">
      <span class="collections-label">Convert</span>
      @for (group of groups(); track group) {
        <label class="collection-checkbox">
          <input type="checkbox" [checked]="isGroupSelected(group)" (change)="toggleGroup(group)"/>
          <span>{{ groupLabel(group) }}</span>
        </label>
      }
    </div>
  `,
  styles: `
    @use './shared';

    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px 10px;
      border-left: 2px solid var(--mat-sys-outline-variant, rgba(128, 128, 128, 0.3));
      font-size: 0.82rem;
    }

    .file-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.78rem;
      opacity: 0.85;
    }

    .badge {
      padding: 1px 8px;
      border-radius: 10px;
      background: color-mix(in srgb, #bec2ff 25%, transparent);
      font-family: monospace;
    }

    .event-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    .event-range-input {
      width: 7rem;
      @include shared.text-input;
    }

    .range-hint {
      opacity: 0.7;
      font-size: 0.72rem;
    }

    .collections-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px 12px;
    }

    .collections-label {
      opacity: 0.8;
    }

    .collection-checkbox {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      white-space: nowrap;

      input {
        accent-color: var(--mat-sys-primary, #4bac84);
        cursor: pointer;
      }
    }

    .status {
      @include shared.status;
      align-items: center;
    }
  `,
})
export class RootEventPickerComponent {
  /** The ROOT event source (URL or picked file). */
  readonly source = input.required<DataSource>();
  /** Event numbers as typed: '0', '0,2,4-5'. */
  readonly eventRange = input('0');
  /** Comma list of collection groups to convert, '' = all. */
  readonly collections = input('');
  readonly eventRangeChange = output<string>();
  readonly collectionsChange = output<string>();

  private readonly rootFile = inject(RootFileService).createHandle();
  private readonly loaders = injectEventLoaders();
  /** Bumped per source; a result for an older source is not shown. */
  private openToken = 0;

  readonly openedFile = this.rootFile.openedFile;
  readonly busy = this.rootFile.busy;
  readonly error = signal<string | null>(null);

  /** True when a loader that can report the event count claims the source. */
  readonly pickerAvailable = computed(() => {
    const source = this.source();
    // untracked: a loader's canLoad() may declare a config key, which
    // applies pending layer values (signal writes) — forbidden inside computed()
    return untracked(() => this.loaders.find(loader => loader.canLoad(source))?.meta.offersEventPicker === true);
  });

  /** Groups of the open file; the known groups when the file could not be opened. */
  readonly groups = computed(() => this.openedFile()?.collectionGroups ?? Object.keys(GROUP_LABELS));

  readonly maxEventHint = computed(() => {
    const file = this.openedFile();
    return file ? ` within 0–${Math.max(0, file.entryCount - 1)}` : '';
  });

  constructor() {
    effect(() => {
      const source = this.source();
      const available = this.pickerAvailable();
      untracked(() => void this.openForCount(source, available));
    });
    inject(DestroyRef).onDestroy(() => this.rootFile.close());
  }

  private async openForCount(source: DataSource, available: boolean): Promise<void> {
    const token = ++this.openToken;
    this.error.set(null);
    if (!available) {
      this.rootFile.close();
      return;
    }
    try {
      await this.rootFile.open(source);
    } catch (error) {
      if (token === this.openToken) {
        this.error.set(error instanceof Error ? error.message : String(error));
      }
    }
  }

  onRangeInput(value: string): void {
    this.eventRangeChange.emit(value);
  }

  groupLabel(group: string): string {
    return GROUP_LABELS[group] ?? group;
  }

  private selectedGroups(): string[] {
    const configured = this.collections().split(',').map(group => group.trim()).filter(Boolean);
    return configured.length ? configured : this.groups();
  }

  isGroupSelected(group: string): boolean {
    return this.selectedGroups().includes(group);
  }

  toggleGroup(group: string): void {
    const selected = new Set(this.selectedGroups());
    if (selected.has(group)) {
      selected.delete(group);
    } else {
      selected.add(group);
    }
    // All groups selected collapses back to '' (= all), so groups added in
    // later versions stay included by default
    const all = this.groups();
    const value = all.every(candidate => selected.has(candidate)) ? '' : all.filter(candidate => selected.has(candidate)).join(',');
    this.collectionsChange.emit(value);
  }
}
