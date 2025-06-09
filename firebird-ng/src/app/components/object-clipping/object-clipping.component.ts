import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  TemplateRef,
  ElementRef,
  ViewContainerRef,
  ChangeDetectorRef
} from '@angular/core';
import {MatCheckbox, MatCheckboxChange} from '@angular/material/checkbox';
import { Subscription } from 'rxjs';

import { ThreeService } from '../../services/three.service';
import { LocalStorageService } from '../../services/local-storage.service';
import {MatMenuItem} from "@angular/material/menu";
import {MatSlider, MatSliderThumb} from "@angular/material/slider";

import {MatButton, MatIconButton} from "@angular/material/button";

import {MatDialog, MatDialogClose, MatDialogRef} from "@angular/material/dialog";
import {MatIcon} from "@angular/material/icon";
import {MatTooltip} from "@angular/material/tooltip";
import {FormsModule} from "@angular/forms";



@Component({
  selector: 'app-custom-object-clipping',
  templateUrl: './object-clipping.component.html',
  styleUrls: ['./object-clipping.component.scss'],
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
export class ObjectClippingComponent implements OnInit, OnDestroy {
  /** Local copies that reflect the config property values. */
  clippingEnabled = false;
  startClippingAngle = 0;
  openingClippingAngle = 180;

  private subscriptions: Subscription[] = [];

  @ViewChild('openBtn', { read: ElementRef }) openBtn!: ElementRef;
  @ViewChild('dialogTemplate') dialogTemplate!: TemplateRef<any>;
  dialogRef: MatDialogRef<any> | null = null;

  constructor(
    private threeService: ThreeService,
    private config: LocalStorageService,
    private dialog: MatDialog,
    private viewContainerRef: ViewContainerRef,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // 1) Initialize local values from the config
    this.clippingEnabled = this.config.clippingEnabled.value;
    this.startClippingAngle = this.config.clippingStartAngle.value;
    this.openingClippingAngle = this.config.clippingOpeningAngle.value;

    // 2) Subscribe to config changes so if another component or code updates them,
    //    this component sees the updated values automatically:
    this.subscriptions.push(
      this.config.clippingEnabled.changes$.subscribe((enabled) => {
        this.clippingEnabled = enabled;
        // Also immediately update ThreeService
        this.threeService.enableClipping(enabled);
        if (enabled) {
          this.threeService.setClippingAngle(
            this.config.clippingStartAngle.value,
            this.config.clippingOpeningAngle.value
          );
        }
      })
    );

    this.subscriptions.push(
      this.config.clippingStartAngle.changes$.subscribe((value) => {
        this.startClippingAngle = value;
        if (this.config.clippingEnabled.value) {
          this.threeService.setClippingAngle(
            value,
            this.config.clippingOpeningAngle.value
          );
        }
      })
    );

    this.subscriptions.push(
      this.config.clippingOpeningAngle.changes$.subscribe((value) => {
        this.openingClippingAngle = value;
        if (this.config.clippingEnabled.value) {
          this.threeService.setClippingAngle(
            this.config.clippingStartAngle.value,
            value
          );
        }
      })
    );

    // 3) Optionally trigger an initial clipping if was enabled:
    if (this.clippingEnabled) {
      this.threeService.enableClipping(true);
      this.threeService.setClippingAngle(this.startClippingAngle, this.openingClippingAngle);
    }
  }

  ngOnDestroy(): void {
    // Unsubscribe from config property streams to avoid memory leaks.
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
  }

  /**
   * User toggles clipping in the UI checkbox.
   */
  toggleClipping(change: MatCheckboxChange): void {
    // Update the config property. This automatically saves to localStorage
    // and triggers the subscription above, which updates the ThreeService.
    this.config.clippingEnabled.value = change.checked;
  }

  /**
   * User changes the start angle. Use the config property setter to persist and update the scene.
   */
  changeStartClippingAngle(angle: number): void {
    this.config.clippingStartAngle.value = angle;
  }

  /**
   * User changes the opening angle. Use the config property setter to persist and update the scene.
   */
  changeOpeningClippingAngle(angle: number): void {
    this.config.clippingOpeningAngle.value = angle;
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
        this.startClippingAngle = newValue;
      } else if (sliderType === 'opening') {
        this.openingClippingAngle = newValue;
      }
    }
  }


}
