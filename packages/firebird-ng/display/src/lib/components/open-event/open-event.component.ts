import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  inject,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDialog, MatDialogClose, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { DataSelectorComponent } from '../data-selector/data-selector.component';

/**
 * "Open data" toolbar button of the display: drops down the data selector
 * (presets, physics cases, or geometry/events by URL or file). Show applies
 * the choice to the running display through the selector's shared path and
 * closes the panel. The same control sits on the config page.
 */
@Component({
  selector: 'app-open-event',
  templateUrl: './open-event.component.html',
  styleUrls: ['./open-event.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogClose, MatIcon, MatIconButton, MatTooltip, DataSelectorComponent],
})
export class OpenEventComponent {
  private readonly dialog = inject(MatDialog);
  private readonly viewContainerRef = inject(ViewContainerRef);

  @ViewChild('openBtn', { read: ElementRef }) openBtn!: ElementRef<HTMLElement>;
  @ViewChild('dialogTemplate') dialogTemplate!: TemplateRef<unknown>;
  private dialogRef: MatDialogRef<unknown> | null = null;

  openDialog(): void {
    if (this.dialogRef) {
      this.closeDialog();
      return;
    }

    // Hangs from the button's left edge, clamped to the viewport so the panel
    // stays reachable when the button sits near the right of a narrow window
    const rect = this.openBtn.nativeElement.getBoundingClientRect();
    const dialogWidth = 480;
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

  closeDialog(): void {
    this.dialogRef?.close();
  }
}
