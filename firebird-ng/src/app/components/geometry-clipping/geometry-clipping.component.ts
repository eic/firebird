import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  TemplateRef,
  ElementRef,
  ViewContainerRef,
  ChangeDetectorRef,
  effect,
  Signal
} from '@angular/core';
import {MatCheckbox, MatCheckboxChange} from '@angular/material/checkbox';
import { toSignal } from '@angular/core/rxjs-interop';

import { ThreeService } from '../../services/three.service';
import { ConfigService } from '../../services/config.service';
import {MatMenuItem} from "@angular/material/menu";
import {MatSlider, MatSliderThumb} from "@angular/material/slider";

import {MatButton, MatIconButton} from "@angular/material/button";

import {MatDialog, MatDialogClose, MatDialogRef} from "@angular/material/dialog";
import {MatIcon} from "@angular/material/icon";
import {MatTooltip} from "@angular/material/tooltip";
import {FormsModule} from "@angular/forms";



@Component({
  selector: 'app-geometry-clipping',
  templateUrl: './geometry-clipping.component.html',
  styleUrls: ['./geometry-clipping.component.scss'],
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

  ]
})
export class GeometryClippingComponent implements OnInit {
  /** Local copies that reflect the config property values. */

  clippingEnabled!: Signal<boolean>;
  startAngle!: Signal<number>;
  openingAngle!: Signal<number>;

  @ViewChild('openBtn', { read: ElementRef }) openBtn!: ElementRef;
  @ViewChild('dialogTemplate') dialogTemplate!: TemplateRef<any>;
  dialogRef: MatDialogRef<any> | null = null;

  constructor(
    private threeService: ThreeService,
    private config: ConfigService,
    private dialog: MatDialog,
    private viewContainerRef: ViewContainerRef,
    private cdr: ChangeDetectorRef
  ) {

        // Get configs
    const configClippingEnabled = this.config.getConfigOrCreate<boolean>('clippingEnabled', true);
    const configStartAngle = this.config.getConfigOrCreate<number>('clippingStartAngle', 0);
    const configOpeningAngle = this.config.getConfigOrCreate<number>('clippingOpeningAngle', 180);

    this.clippingEnabled = toSignal(configClippingEnabled.subject, { requireSync: true });
    this.startAngle = toSignal(configStartAngle.subject, { requireSync: true });
    this.openingAngle = toSignal(configOpeningAngle.subject, { requireSync: true });

    // Changes in enable/disable clipping
    effect(() => {
      this.threeService.enableClipping(this.clippingEnabled());
      if(this.clippingEnabled()) {
        this.threeService.setClippingAngle(this.startAngle(), this.openingAngle());
      }
    });

    // changes in start or opening angles
    effect(()=> {
      this.threeService.setClippingAngle(this.startAngle(), this.openingAngle());
    });

  }

  // In your ObjectClippingComponent ngOnInit, replace the getConfigOrThrow calls with:

  ngOnInit(): void {


  }

  /**
   * User toggles clipping in the UI checkbox.
   */
  toggleClipping(change: MatCheckboxChange): void {
    // Update the config property. This automatically saves to localStorage
    // and triggers the subscription above, which updates the ThreeService.
    this.config.getConfigOrThrow<boolean>('clippingEnabled').value = change.checked;
  }

  /**
   * User changes the start angle. Use the config property setter to persist and update the scene.
   */
  changeStartClippingAngle(angle: number): void {
    this.config.getConfigOrThrow<number>('clippingStartAngle').value = angle;
  }

  /**
   * User changes the opening angle. Use the config property setter to persist and update the scene.
   */
  changeOpeningClippingAngle(angle: number): void {
    this.config.getConfigOrThrow<number>('clippingOpeningAngle').value = angle;
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


  /**
   * Updates angle value in real-time as any slider moves
   * @param event The slider input event
   * @param sliderType Identifier for which slider is being updated ('start' or 'opening')
   */
  onSliderInput(event: any, sliderType: 'start' | 'opening'): void {
    // Extract the value safely from the event
    let newValue: number | null = null;

    // Try different ways to get the value based on Angular Material version
    if (event && event.value !== undefined) {
      newValue = event.value;
    } else if (event && event.source && event.source.value !== undefined) {
      newValue = event.source.value;
    } else if (event && event.target && event.target.value !== undefined) {
      newValue = Number(event.target.value);
    }

    // Only update if we got a valid number
    if (newValue !== null && !isNaN(newValue)) {
      // Update the appropriate property based on which slider was moved
      if (sliderType === 'start') {
        // this.startAngle..(newValue);
      } else if (sliderType === 'opening') {
        // this.openingAngle = newValue;
      }
    }
  }
}
