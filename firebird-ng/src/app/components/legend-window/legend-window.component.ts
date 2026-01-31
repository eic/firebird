import {Component, OnInit, OnDestroy, ViewChild, TemplateRef, ViewContainerRef} from '@angular/core';


import { ThreeService } from '../../services/three.service';
import { ConfigService } from '../../services/config.service';


import {MatIconButton} from "@angular/material/button";

import {MatDialog, MatDialogClose, MatDialogRef} from "@angular/material/dialog";
import {MatIcon} from "@angular/material/icon";
import {MatTooltip} from "@angular/material/tooltip";

@Component({
  selector: 'app-legend-window',
  templateUrl: './legend-window.component.html',
  styleUrls: ['./legend-window.component.scss'],
  imports: [
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
    private config: ConfigService,
    private dialog: MatDialog,
    private viewContainerRef: ViewContainerRef
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
        hasBackdrop: false,
        viewContainerRef: this.viewContainerRef
      });

      this.dialogRef.afterClosed().subscribe(() => {
        this.dialogRef = null;
      });
    }
  }



}
