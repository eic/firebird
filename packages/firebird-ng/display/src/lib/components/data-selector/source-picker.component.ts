import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked, viewChild } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import type { DataSource } from '@dexvis/firebird-core';
import { ResourceSelectComponent } from '../resource-select/resource-select.component';

/**
 * One data source field of the Manual tab: pick a known URL or type one
 * (Select), or drop/choose a local file (Upload). Used once for geometry and
 * once for events. Emits the URL string, the File, or '' when cleared. The
 * file is never uploaded anywhere: loaders read it in place.
 */
@Component({
  selector: 'firebird-source-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, MatIconButton, MatTooltip, ResourceSelectComponent],
  template: `
    <div class="picker-header">
      <span class="picker-label">{{ label() }}</span>
      <div class="mode-switch" role="tablist">
        <button type="button" class="mode" [class.active]="mode() === 'select'" (click)="setMode('select')">Select</button>
        <button type="button" class="mode" [class.active]="mode() === 'upload'" (click)="setMode('upload')">Upload</button>
      </div>
    </div>

    @if (mode() === 'select') {
      <firebird-resource-select
        #urlSelect
        [options]="options()"
        [selected]="urlValue()"
        [label]="placeholder()"
        (valueChange)="onUrlTyped($event)">
      </firebird-resource-select>
    } @else {
      @if (fileValue(); as file) {
        <div class="file-row">
          <mat-icon>insert_drive_file</mat-icon>
          <span class="file-name" [title]="file.name">{{ file.name }}</span>
          <button mat-icon-button class="clear-btn" matTooltip="Remove this file" (click)="clearFile()">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }
      <label class="drop-zone"
             [class.drag-over]="dragOver()"
             (dragover)="onDragOver($event)"
             (dragleave)="onDragLeave($event)"
             (drop)="onDrop($event)">
        <input type="file" [accept]="accept()" hidden (change)="onFilePicked($event)"/>
        <mat-icon>upload_file</mat-icon>
        <span class="drop-hint">Drop a file here, or click to choose</span>
        @if (hint()) {
          <span class="drop-note">{{ hint() }}</span>
        }
      </label>
    }
  `,
  styles: `
    @use './shared';

    :host {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .picker-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .picker-label {
      @include shared.section-label;
    }

    .mode-switch {
      display: inline-flex;
      border: 1px solid var(--mat-sys-outline, rgba(128, 128, 128, 0.6));
      border-radius: 6px;
      overflow: hidden;
    }

    .mode {
      padding: 2px 10px;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.75rem;
      cursor: pointer;
      opacity: 0.75;

      &.active {
        opacity: 1;
        background: color-mix(in srgb, var(--mat-sys-primary, #4bac84) 25%, transparent);
      }
    }

    .drop-zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 14px 12px;
      border: 2px dashed var(--mat-sys-outline, rgba(128, 128, 128, 0.6));
      border-radius: 10px;
      cursor: pointer;
      text-align: center;
      transition: border-color 0.15s, background 0.15s;

      &:hover,
      &.drag-over {
        border-color: var(--mat-sys-primary, #4bac84);
        background: color-mix(in srgb, var(--mat-sys-primary, #4bac84) 8%, transparent);
      }

      mat-icon {
        font-size: 26px;
        width: 26px;
        height: 26px;
        opacity: 0.8;
      }
    }

    .drop-hint {
      font-size: 0.8rem;
    }

    .drop-note {
      font-size: 0.72rem;
      opacity: 0.7;
    }

    .file-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.82rem;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        opacity: 0.8;
      }
    }

    .file-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .clear-btn {
      width: 28px;
      height: 28px;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
  `,
})
export class SourcePickerComponent {
  readonly label = input.required<string>();
  /** URLs offered in the Select drop-down; any other URL can be typed. */
  readonly options = input<string[]>([]);
  readonly placeholder = input('URL');
  /** File input accept list, e.g. '.root' or '.root,.json,.zip'. */
  readonly accept = input('.root');
  /** Small note under the drop zone. */
  readonly hint = input('');
  /** Current value; the host owns it and passes it back after routing. */
  readonly value = input<DataSource | ''>('');
  /**
   * Bump to make the text field show `value` again when the host kept the
   * value but the typed text went elsewhere (a geometry file typed into the
   * events field moves to the geometry field; this field must then show what
   * it still holds, not the moved text).
   */
  readonly resyncToken = input(0);
  readonly valueChange = output<DataSource | ''>();

  private readonly urlSelect = viewChild<ResourceSelectComponent>('urlSelect');

  readonly mode = signal<'select' | 'upload'>('select');
  readonly dragOver = signal(false);

  readonly urlValue = computed(() => (typeof this.value() === 'string' ? this.value() as string : ''));
  readonly fileValue = computed(() => (this.value() instanceof File ? this.value() as File : null));

  constructor() {
    effect(() => {
      this.resyncToken();
      const select = this.urlSelect();
      if (select) select.selected = untracked(this.urlValue);
    });
  }

  setMode(mode: 'select' | 'upload'): void {
    this.mode.set(mode);
  }

  onUrlTyped(url: string): void {
    this.valueChange.emit((url ?? '').trim());
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Clear the input so picking the same file again still fires a change
    input.value = '';
    if (file) this.valueChange.emit(file);
  }

  clearFile(): void {
    this.valueChange.emit('');
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
    if (file) this.valueChange.emit(file);
  }
}
