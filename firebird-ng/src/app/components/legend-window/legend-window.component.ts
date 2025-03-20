import {Component, OnInit, OnDestroy, ViewChild, TemplateRef} from '@angular/core';
import {MatCheckbox, MatCheckboxChange} from '@angular/material/checkbox';
import { Subscription } from 'rxjs';

import { ThreeService } from '../../services/three.service';
import { UserConfigService } from '../../services/user-config.service';
import {MatMenuItem} from "@angular/material/menu";
import {MatSlider, MatSliderThumb} from "@angular/material/slider";

import {MatButton, MatIconButton} from "@angular/material/button";

import {MatDialog, MatDialogClose, MatDialogRef} from "@angular/material/dialog";
import {MatIcon} from "@angular/material/icon";
import {MatTooltip} from "@angular/material/tooltip";

@Component({
  selector: 'app-legend-window',
  templateUrl: './legend-window.component.html',
  styleUrls: ['./legend-window.component.scss'],
  imports: [
    MatSlider,
    MatMenuItem,
    MatSliderThumb,
    MatCheckbox,
    MatIcon,
    MatDialogClose,
    MatIconButton,
    MatTooltip
  ]
})
export class LegendWindowComponent implements OnInit, OnDestroy {
  /** Local copies that reflect the config property values. */
  clippingEnabled = false;




  @ViewChild('dialogTemplate') dialogTemplate!: TemplateRef<any>;
  dialogRef: MatDialogRef<any> | null = null;

  constructor(
    private threeService: ThreeService,
    private config: UserConfigService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {

  }

  ngOnDestroy(): void {

  }



  openDialog(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    } else {
      this.dialogRef = this.dialog.open(this.dialogTemplate, {
        position: {
          top: '63px',
          left: '600px'
        },
        disableClose: true,
        hasBackdrop: false
      });

      this.dialogRef.afterClosed().subscribe(() => {
        this.dialogRef = null;
      });
    }
  }

  toggleRaycast() {
    this.threeService.toggleRaycast();
  }

  get isRaycastEnabled(): boolean {
    return this.threeService.isRaycastEnabledState();
  }

}
