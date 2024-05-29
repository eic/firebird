import { Component, Input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { IOOptionsDialogComponent } from './io-options-dialog/io-options-dialog.component';
import {PhoenixUIModule} from "phoenix-ui-components";

@Component({
  selector: 'eic-io-options',
  standalone: true,
  templateUrl: './io-options.component.html',
  styleUrls: ['./io-options.component.scss'],
  imports: [
    PhoenixUIModule
  ]
})
export class IoOptionsComponent {

  constructor(private dialog: MatDialog) {}

  openIODialog() {
    this.dialog.open(IOOptionsDialogComponent, { panelClass: 'dialog', });
  }
}
