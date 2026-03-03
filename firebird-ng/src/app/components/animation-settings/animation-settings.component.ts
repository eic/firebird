import {
  Component,
  ViewChild,
  TemplateRef,
  ElementRef
} from '@angular/core';
import {MatInputModule} from '@angular/material/input';
import {EventDisplayService} from '../../services/event-display.service';
import {FormsModule} from '@angular/forms';
import {MatIconButton} from '@angular/material/button';
import {MatIcon} from '@angular/material/icon';
import {MatTooltip} from '@angular/material/tooltip';
import {MatDialog, MatDialogClose, MatDialogRef} from '@angular/material/dialog';
import {MatSlideToggle} from '@angular/material/slide-toggle';

@Component({
  selector: 'app-animation-settings',
  standalone: true,
  imports: [MatInputModule, FormsModule, MatIcon, MatIconButton, MatTooltip, MatDialogClose, MatSlideToggle],
  templateUrl: './animation-settings.component.html',
  styleUrls: ['./animation-settings.component.scss']
})
export class AnimationSettingsComponent {

  @ViewChild('openBtn', {read: ElementRef})
  openBtn!: ElementRef;

  @ViewChild('dialogTemplate')
  dialogTemplate!: TemplateRef<any>;

  dialogRef: MatDialogRef<any> | null = null;

  moveCameraDuringAnimation: boolean;

  constructor(
    public eventDisplayService: EventDisplayService,
    private dialog: MatDialog
  ) {
    this.moveCameraDuringAnimation = this.eventDisplayService.animateCameraMovement;
  }

  openDialog(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
      return;
    }

    // Sync local state from service when opening
    this.moveCameraDuringAnimation = this.eventDisplayService.animateCameraMovement;

    const rect = this.openBtn.nativeElement.getBoundingClientRect();
    const dialogWidth = 320;
    const left = rect.right - dialogWidth;

    this.dialogRef = this.dialog.open(this.dialogTemplate, {
      position: {
        bottom: `${window.innerHeight - rect.bottom + 55}px`,
        left: `${Math.max(left, 0)}px`
      },
      hasBackdrop: false,
      panelClass: 'custom-position-dialog',
      autoFocus: false
    });

    this.dialogRef.afterClosed().subscribe(() => {
      this.dialogRef = null;
    });
  }

  applySettings(): void {
    this.eventDisplayService.animateCameraMovement = this.moveCameraDuringAnimation;
    this.dialogRef?.close();
  }
}
