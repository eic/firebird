import {Component, ElementRef, OnDestroy, TemplateRef, ViewChild, ViewContainerRef, ChangeDetectionStrategy, signal} from '@angular/core';
import {MatDialog, MatDialogClose, MatDialogRef} from "@angular/material/dialog";
import {MatMenuItem} from "@angular/material/menu";
import {MatCheckbox, MatCheckboxChange} from "@angular/material/checkbox";
import {MatIcon} from "@angular/material/icon";
import {MatIconButton} from "@angular/material/button";
import {Subscription} from "rxjs";
import {ThreeService} from "../../services/three.service";
import {SelectionService} from "../../services/selection.service";
import * as THREE from 'three';
import {MatTooltip} from "@angular/material/tooltip";

@Component({
  selector: 'app-object-raycast',
  imports: [
    MatIcon,
    MatDialogClose,
    MatMenuItem,
    MatCheckbox,
    MatTooltip,
    MatIconButton,
  ],
  templateUrl: './object-raycast.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './object-raycast.component.scss'
})
export class ObjectRaycastComponent implements OnDestroy {

  @ViewChild('openRayBtn', { read: ElementRef }) openRayBtn!: ElementRef;
  @ViewChild('raycastDialogTmpl') raycastDialogTmpl!: TemplateRef<any>;
  dialogRef: MatDialogRef<any> | null = null;

  // UI state. Signals: the checkboxes live in the dialog, which renders this
  // component's template in another view; a plain field changed there would
  // never reach the overlay below in this component's own view.
  readonly coordsEnabled = signal(false);
  readonly distanceEnabled = signal(false);

  // Signals as well: updates arrive from native canvas listeners via
  // ThreeService, which schedule no change detection under zoneless.
  readonly coordsText = signal('');
  readonly distanceText = signal('');

  private coordsSub?: Subscription;
  private distSub?: Subscription;
  private distLine?: THREE.Line;

  /** True while this component holds ThreeService's measure mode on. */
  private measuring = false;

  constructor(
    private dialog: MatDialog,
    private three: ThreeService,
    private viewContainerRef: ViewContainerRef,
    /** Selection is resolved by SelectionService (3D pick → entity), not by
     * this component's own picking; the overlay shows the shared selection. */
    public selection: SelectionService,
  ) {}

  /* ------------ UI ------------- */
  openRaycastDialog() {
    if (this.dialogRef) {
      this.dialogRef.close();
      return;
    }

    const rect = this.openRayBtn.nativeElement.getBoundingClientRect();
    const dialogWidth = 320;

    const left = Math.max(rect.right - dialogWidth, 8);
    const top = rect.bottom + 12;

    this.dialogRef = this.dialog.open(this.raycastDialogTmpl, {
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

  /* ---------- checkbox handlers ---------- */


  toggleShowCoords(e: MatCheckboxChange): void {
    this.coordsEnabled.set(e.checked);
    this.updateSubscriptions();
    this.updateRaycastActivation();
  }

  toggleShowDistance(e: MatCheckboxChange): void {
    this.distanceEnabled.set(e.checked);
    this.setMeasureMode(e.checked);
    this.updateSubscriptions();
    this.updateRaycastActivation();
  }

  /** Measure mode turns clicks into distance points, so click-to-select pauses while it is on. */
  private setMeasureMode(on: boolean): void {
    this.measuring = on;
    this.three.measureMode = on;
  }

  /* ---------- central switch ---------- */
  /** Ensures ThreeService raycast state matches UI needs */
  private updateRaycastActivation(): void {
    const needRaycast = this.coordsEnabled() || this.distanceEnabled();
    const isOn        = this.three.isRaycastEnabledState();
    if (needRaycast && !isOn) this.three.toggleRaycast();
    if (!needRaycast && isOn) this.three.toggleRaycast();
  }

  /* ---------- RxJS subscriptions ---------- */
  private updateSubscriptions(): void {

    /* XYZ overlay */
    if (this.coordsEnabled() && !this.coordsSub) {
      this.coordsSub = this.three.pointHovered.subscribe(pt => {
        this.coordsText.set(`X:${pt.x.toFixed(2)}  Y:${pt.y.toFixed(2)}  Z:${pt.z.toFixed(2)}`);
      });
    } else if (!this.coordsEnabled() && this.coordsSub) {
      this.coordsSub.unsubscribe();
      this.coordsSub = undefined;
      this.coordsText.set('');
    }

    /* distance overlay */
    if (this.distanceEnabled() && !this.distSub) {
      this.distSub = this.three.distanceReady.subscribe(({ p1, p2, dist }) => {
        this.distanceText.set(`${dist.toFixed(2)} units`);

        // draw / update line helper
        if (!this.distLine) {
          const g = new THREE.BufferGeometry().setFromPoints([p1, p2]);
          const m = new THREE.LineBasicMaterial({ color: 0xffff00 });
          this.distLine = new THREE.Line(g, m);
          this.three.sceneHelpers.add(this.distLine);
        } else {
          (this.distLine.geometry as THREE.BufferGeometry).setFromPoints([p1, p2]);
        }
        this.three.invalidate();
      });
    } else if (!this.distanceEnabled() && this.distSub) {
      this.distSub.unsubscribe();
      this.distSub = undefined;
      this.distanceText.set('');
      this.removeDistanceLine();
    }

  }

  private removeDistanceLine(): void {
    if (!this.distLine) return;
    this.three.sceneHelpers.remove(this.distLine);
    this.distLine.geometry.dispose();
    (this.distLine.material as THREE.Material).dispose();
    this.distLine = undefined;
    this.three.invalidate();
  }

  /* ---------- cleanup ---------- */
  /**
   * ThreeService outlives display pages: leaving the page must hand back
   * everything this component switched on there. Otherwise measure mode
   * stays on (click-to-select stops working on the next visit), hover
   * picking keeps running, and the distance line stays in the scene.
   */
  ngOnDestroy(): void {
    this.dialogRef?.close();
    // The page holds two instances (desktop and mobile toolbars): only the
    // one that switched hover picking on switches it off.
    const holdsRaycast = this.coordsEnabled() || this.distanceEnabled();
    this.coordsEnabled.set(false);
    this.distanceEnabled.set(false);
    if (this.measuring) {
      this.setMeasureMode(false);
    }
    this.updateSubscriptions();
    if (holdsRaycast) {
      this.updateRaycastActivation();
    }
    this.removeDistanceLine();
  }
}
