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
import {NgIf} from "@angular/common";

@Component({
  selector: 'app-object-raycast',
  imports: [
    MatIcon,
    MatDialogClose,
    MatMenuItem,
    MatCheckbox,
    MatTooltip,
    MatIconButton,
    NgIf
  ],
  templateUrl: './object-raycast.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './object-raycast.component.scss'
})
export class ObjectRaycastComponent implements OnDestroy {

  @ViewChild('openRayBtn', { read: ElementRef }) openRayBtn!: ElementRef;
  @ViewChild('raycastDialogTmpl') raycastDialogTmpl!: TemplateRef<any>;
  dialogRef: MatDialogRef<any> | null = null;

  /** UI state */

  coordsEnabled    = false;
  distanceEnabled  = false;

  // signals: updates arrive from native canvas listeners via ThreeService,
  // which schedule no change detection under zoneless
  coordsText   = signal('');
  distanceText = signal('');

  private coordsSub?: Subscription;
  private distSub?: Subscription;
  private distLine?: THREE.Line;


  /** internals */
  private firstPoint: THREE.Vector3 | null = null;
  private clickSub?: Subscription;
  private hoverSub?: Subscription;

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
    this.coordsEnabled = e.checked;
    this.updateSubscriptions();
    this.updateRaycastActivation();
  }

  toggleShowDistance(e: MatCheckboxChange): void {
    this.distanceEnabled = e.checked;
    this.three.measureMode = e.checked;
    if (!e.checked) this.firstPoint = null;
    this.updateSubscriptions();
    this.updateRaycastActivation();
  }

  /* ---------- central switch ---------- */
  /** Ensures ThreeService raycast state matches UI needs */
  private updateRaycastActivation(): void {
    const needRaycast =  this.coordsEnabled || this.distanceEnabled;
    const isOn        = this.three.isRaycastEnabledState();
    if (needRaycast && !isOn) this.three.toggleRaycast();
    if (!needRaycast && isOn) this.three.toggleRaycast();
  }

  /* ---------- RxJS subscriptions ---------- */
  private updateSubscriptions(): void {

    /* XYZ overlay */
    if (this.coordsEnabled && !this.coordsSub) {
      this.coordsSub = this.three.pointHovered.subscribe(pt => {
        this.coordsText.set(`X:${pt.x.toFixed(2)}  Y:${pt.y.toFixed(2)}  Z:${pt.z.toFixed(2)}`);
      });
    } else if (!this.coordsEnabled && this.coordsSub) {
      this.coordsSub.unsubscribe();
      this.coordsSub = undefined;
      this.coordsText.set('');
    }

    /* distance overlay */
    if (this.distanceEnabled && !this.distSub) {
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
      });
    } else if (!this.distanceEnabled && this.distSub) {
      this.distSub.unsubscribe();
      this.distSub = undefined;
      this.distanceText.set('');

      // remove helper line
      if (this.distLine) {
        this.three.sceneHelpers.remove(this.distLine);
        this.distLine.geometry.dispose();
        (this.distLine.material as THREE.Material).dispose();
        this.distLine = undefined!;
      }
    }

  }

  /* ---------- cleanup ---------- */
  ngOnDestroy(): void {
    this.hoverSub?.unsubscribe();
    this.clickSub?.unsubscribe();
  }
}
