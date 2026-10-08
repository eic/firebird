import {
  Component,
  ViewChild,
  TemplateRef,
  ElementRef,
  ViewContainerRef,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import {MatCheckbox, MatCheckboxChange} from '@angular/material/checkbox';
import {MatSlideToggleChange} from '@angular/material/slide-toggle';

import { ConfigService } from '@dexvis/app-features';
import {MatMenuItem} from "@angular/material/menu";
import {MatSlider, MatSliderThumb} from "@angular/material/slider";

import {MatButton, MatIconButton} from "@angular/material/button";

import {MatDialog, MatDialogClose, MatDialogRef} from "@angular/material/dialog";
import {MatIcon} from "@angular/material/icon";
import {MatTooltip} from "@angular/material/tooltip";
import {FormsModule} from "@angular/forms";
import {MatSlideToggle} from "@angular/material/slide-toggle";
import {
  CLIPPING_ENABLED_CONFIG,
  CLIPPING_OPENING_ANGLE_CONFIG,
  CLIPPING_START_ANGLE_CONFIG,
  Z_CLIPPING_ENABLED_CONFIG,
  Z_CLIPPING_FORWARD_CONFIG,
  Z_CLIPPING_POSITION_CONFIG,
} from '../../firebird/config-keys';


/**
 * Toolbar panel for the geometry clipping of the main view. A view and an
 * editor of the clipping config keys only: ThreeService applies the keys to
 * the scene, so a deep link, the server config or a saved value clips the
 * same way with or without this panel on the page.
 */
@Component({
  selector: 'app-geometry-clipping',
  templateUrl: './geometry-clipping.component.html',
  styleUrls: ['./geometry-clipping.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatSlider,
    MatMenuItem,
    MatSliderThumb,
    MatCheckbox,
    MatButton,
    MatIcon,
    MatDialogClose,
    MatIconButton,
    MatTooltip,
    FormsModule,
    MatSlideToggle,
  ]
})
export class GeometryClippingComponent {
  private readonly config = inject(ConfigService);
  private readonly dialog = inject(MatDialog);
  private readonly viewContainerRef = inject(ViewContainerRef);

  private readonly clippingEnabledProperty = this.config.declare(CLIPPING_ENABLED_CONFIG);
  private readonly startAngleProperty = this.config.declare(CLIPPING_START_ANGLE_CONFIG);
  private readonly openingAngleProperty = this.config.declare(CLIPPING_OPENING_ANGLE_CONFIG);
  private readonly zClippingEnabledProperty = this.config.declare(Z_CLIPPING_ENABLED_CONFIG);
  private readonly zClippingPositionProperty = this.config.declare(Z_CLIPPING_POSITION_CONFIG);
  private readonly zClippingForwardProperty = this.config.declare(Z_CLIPPING_FORWARD_CONFIG);

  // Signals of the config values: the dialog template reads them, and they
  // follow changes from any source.
  readonly clippingEnabled = this.clippingEnabledProperty.valueSignal;
  readonly startAngle = this.startAngleProperty.valueSignal;
  readonly openingAngle = this.openingAngleProperty.valueSignal;
  readonly zClippingEnabled = this.zClippingEnabledProperty.valueSignal;
  readonly zClippingPosition = this.zClippingPositionProperty.valueSignal;
  readonly zClippingForward = this.zClippingForwardProperty.valueSignal;

  @ViewChild('openBtn', { read: ElementRef }) openBtn!: ElementRef;
  @ViewChild('dialogTemplate') dialogTemplate!: TemplateRef<any>;
  dialogRef: MatDialogRef<any> | null = null;

  /** User toggles wedge clipping. A runtime write: saved, and it ends a URL override. */
  toggleClipping(change: MatCheckboxChange): void {
    this.clippingEnabledProperty.value = change.checked;
  }

  /** User changes the start angle. */
  changeStartClippingAngle(angle: number): void {
    if (!isNaN(angle)) {
      this.startAngleProperty.value = angle;
    }
  }

  /** User changes the opening angle. */
  changeOpeningClippingAngle(angle: number): void {
    if (!isNaN(angle)) {
      this.openingAngleProperty.value = angle;
    }
  }

  /** User toggles Z clipping. */
  toggleZClipping(change: MatCheckboxChange): void {
    this.zClippingEnabledProperty.value = change.checked;
  }

  /** User changes the Z clipping position. */
  changeZClippingPosition(z: number): void {
    if (!isNaN(z)) {
      this.zClippingPositionProperty.value = z;
    }
  }

  /** User toggles the Z clipping direction. */
  toggleZClippingDirection(change: MatSlideToggleChange): void {
    this.zClippingForwardProperty.value = change.checked;
  }

  openDialog(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
      return;
    }

    const rect = this.openBtn.nativeElement.getBoundingClientRect();
    const dialogWidth = 320;

    const left = Math.max(rect.right - dialogWidth, 8);
    const top = rect.bottom + 12;

    this.dialogRef = this.dialog.open(this.dialogTemplate, {
      position: {
        top: `${top}px`,
        left: `${left}px`
      },
      hasBackdrop: false,
      panelClass: 'custom-position-dialog',
      autoFocus: false,
      viewContainerRef: this.viewContainerRef
    });

    this.dialogRef.afterClosed().subscribe(() => {
      this.dialogRef = null;
    });
  }
}
