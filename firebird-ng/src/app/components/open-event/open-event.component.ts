import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog, MatDialogClose, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTooltip } from '@angular/material/tooltip';
import type { DataSource } from '@firebird/core';

import { ConfigService } from '../../services/config.service';
import { EventDisplayService } from '../../services/event-display.service';
import { FileOpenRouterService } from '../../services/file-open-router.service';
import { RootFileService } from '../../services/root-file.service';

/**
 * Yields long enough for a just-set status signal to reach the screen before
 * a main-thread-blocking stretch begins. Two macrotasks: the first lets
 * change detection run, the second lets the browser present the frame.
 */
function yieldToUi(): Promise<void> {
  return new Promise(resolve => setTimeout(() => setTimeout(resolve, 0), 0));
}

/** Checkbox captions of the conversion collection groups. */
const GROUP_LABELS: Record<string, string> = {
  tracker_hits: 'Tracker hits',
  tracks: 'Tracks',
  mc_trajectories: 'MC hit trajectories',
  mc_particles: 'MC particles',
};

/**
 * "Open event" toolbar button and its drop-down panel: point Firebird at a ROOT
 * file - drop it, pick it, or paste a URL - choose which events, press Show.
 *
 * This component is the CONTROL that routes. It does not know one ROOT file
 * from another: it hands the source to FileOpenRouterService, which asks the
 * registered loaders, and then does what the answer says - load geometry
 * straight away, or open an event file and offer the event picker. A user who
 * drops the detector geometry here gets the geometry, not an error.
 *
 * The file is NOT uploaded and NOT read into memory - it stays where it is and
 * the converter reads only the bytes of the requested events, so multi-GB files
 * are fine. All of it runs in a worker; the panel stays responsive.
 */
@Component({
  selector: 'app-open-event',
  templateUrl: './open-event.component.html',
  styleUrls: ['./open-event.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButton,
    MatDialogClose,
    MatIcon,
    MatIconButton,
    MatProgressSpinner,
    MatTooltip,
  ],
})
export class OpenEventComponent {
  private readonly rootFiles = inject(RootFileService);
  private readonly router = inject(FileOpenRouterService);
  private readonly eventDisplay = inject(EventDisplayService);
  private readonly config = inject(ConfigService);
  private readonly dialog = inject(MatDialog);
  private readonly viewContainerRef = inject(ViewContainerRef);

  /** The event file open in the converter: name, data model and event count. */
  readonly openedFile = this.rootFiles.openedFile;
  /** True while a direct (no event picker) load runs, e.g. a dropped DEX file. */
  private readonly directLoadBusy = signal(false);
  /** True while the worker converts or a direct load runs. */
  readonly busy = computed(() => this.rootFiles.busy() || this.directLoadBusy());

  /** Event numbers as typed: '1', '0,2,4-5'. */
  readonly eventRange = signal('0');
  /**
   * Collection groups NOT to convert (checkboxes store the exceptions, so
   * "everything on" — the default — is an empty set). The same groups are
   * reachable without the UI through the `events.rootCollections` config key,
   * which seeds this set when a file opens.
   */
  readonly excludedGroups = signal<ReadonlySet<string>>(new Set<string>());
  readonly urlInput = signal('');
  readonly errorMessage = signal<string | null>(null);
  readonly warnings = signal<string[]>([]);
  readonly statusMessage = signal<string | null>(null);
  readonly dragOver = signal(false);

  @ViewChild('openBtn', { read: ElementRef }) openBtn!: ElementRef<HTMLElement>;
  @ViewChild('dialogTemplate') dialogTemplate!: TemplateRef<unknown>;
  private dialogRef: MatDialogRef<unknown> | null = null;

  /** Highest event number the open file allows, or 0 when nothing is open. */
  get maxEventNumber(): number {
    return Math.max(0, (this.openedFile()?.entryCount ?? 1) - 1);
  }

  openDialog(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
      return;
    }

    // Hangs from the button's left edge, clamped to the viewport so the panel
    // stays reachable when the button sits near the right of a narrow window
    const rect = this.openBtn.nativeElement.getBoundingClientRect();
    const dialogWidth = 420;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - dialogWidth - 8));
    const top = rect.bottom + 12;

    this.dialogRef = this.dialog.open(this.dialogTemplate, {
      position: { top: `${top}px`, left: `${left}px` },
      hasBackdrop: false,
      panelClass: 'custom-position-dialog',
      autoFocus: false,
      viewContainerRef: this.viewContainerRef,
    });
    this.dialogRef.afterClosed().subscribe(() => {
      this.dialogRef = null;
    });
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Clear the input so picking the same file again still fires a change
    input.value = '';
    if (file) void this.openSource(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.openSource(file);
  }

  openUrl(): void {
    const url = this.urlInput().trim();
    if (url) void this.openSource(url);
  }

  /**
   * Routes a source to the loader that claims it: geometry loads immediately,
   * an event file is opened so the user can choose which events to convert.
   */
  async openSource(source: DataSource): Promise<void> {
    this.errorMessage.set(null);
    this.warnings.set([]);
    this.statusMessage.set(null);
    try {
      const route = await this.router.route(source);
      if (route.kind === 'unknown') {
        this.errorMessage.set(route.message);
        return;
      }
      if (route.kind === 'geometry') {
        // Nothing to choose for geometry - a detector is a detector
        this.statusMessage.set(`Loading detector geometry with ${route.loader.meta.label}…`);
        const loaded = await route.loader.load(source);
        this.statusMessage.set(
          loaded.cancelled ? 'Geometry load was superseded' : 'Detector geometry loaded',
        );
        return;
      }
      if (!route.loader.meta.offersEventPicker) {
        // The format has no pick-then-convert flow (a DEX file): the loader
        // loads all its events in one go and they land in the event selector
        this.statusMessage.set(`Loading events with ${route.loader.meta.label}…`);
        this.directLoadBusy.set(true);
        try {
          // Let the status paint before the load's main-thread-blocking parts
          await yieldToUi();
          const data = await route.loader.loadEvents(source);
          const count = data?.events?.length ?? 0;
          if (!count) {
            this.errorMessage.set(`'${this.nameOf(source)}' held no displayable events`);
            this.statusMessage.set(null);
            return;
          }
          this.statusMessage.set(
            count === 1 ? 'Showing 1 event' : `Showing ${count} events — pick one in the toolbar`,
          );
        } finally {
          this.directLoadBusy.set(false);
        }
        return;
      }
      const opened = await this.rootFiles.open(source);
      this.eventRange.set('0');
      this.seedGroupsFromConfig(opened.collectionGroups);
      this.statusMessage.set(null);
      console.log(
        `[OpenEvent]: opened '${opened.sourceName}' (${opened.model}, ${opened.entryCount} events)`,
      );
    } catch (error) {
      this.errorMessage.set(this.messageOf(error));
    }
  }

  private nameOf(source: DataSource): string {
    return typeof source === 'string' ? source : source.name;
  }

  setEventRange(value: string): void {
    this.eventRange.set(value);
  }

  setUrl(value: string): void {
    this.urlInput.set(value);
  }

  groupLabel(group: string): string {
    return GROUP_LABELS[group] ?? group;
  }

  isGroupSelected(group: string): boolean {
    return !this.excludedGroups().has(group);
  }

  toggleGroup(group: string): void {
    const next = new Set(this.excludedGroups());
    if (next.has(group)) {
      next.delete(group);
    } else {
      next.add(group);
    }
    this.excludedGroups.set(next);
  }

  /** Checkboxes start from the `events.rootCollections` config (empty = all on). */
  private seedGroupsFromConfig(availableGroups: string[]): void {
    const configured = (this.config.getConfigOrCreate<string>('events.rootCollections', '').value || '')
      .split(',').map(group => group.trim()).filter(Boolean);
    const excluded = configured.length
      ? availableGroups.filter(group => !configured.includes(group))
      : [];
    this.excludedGroups.set(new Set(excluded));
  }

  /** The groups to convert, or undefined when every checkbox is on (= all). */
  private selectedGroups(): string[] | undefined {
    const excluded = this.excludedGroups();
    if (excluded.size === 0) return undefined;
    const available = this.openedFile()?.collectionGroups ?? [];
    return available.filter(group => !excluded.has(group));
  }

  /** Converts the selected events and puts them on screen. */
  async show(): Promise<void> {
    if (!this.openedFile() || this.busy()) return;
    this.errorMessage.set(null);
    this.warnings.set([]);
    const range = this.eventRange().trim() || '0';
    try {
      this.statusMessage.set(`Converting events ${range}…`);
      const converted = await this.rootFiles.convert(range, this.selectedGroups());
      this.warnings.set(converted.warnings);
      // Building the visuals blocks the main thread for large events, so the
      // status must reach the screen BEFORE the block starts
      this.statusMessage.set('Building visuals…');
      await yieldToUi();
      const data = await this.eventDisplay.showDexDocument(converted.dex);
      if (!data) {
        this.errorMessage.set(`Events ${range} converted to no displayable data`);
        this.statusMessage.set(null);
        return;
      }
      const count = converted.entries.length;
      this.statusMessage.set(
        count === 1
          ? `Showing event ${converted.entries[0]}`
          : `Showing ${count} events (${range}) — pick one in the toolbar`,
      );
    } catch (error) {
      this.errorMessage.set(this.messageOf(error));
    }
  }

  /** Forgets the open file and shuts the worker down. */
  closeFile(): void {
    this.rootFiles.close();
    this.errorMessage.set(null);
    this.warnings.set([]);
    this.statusMessage.set(null);
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
