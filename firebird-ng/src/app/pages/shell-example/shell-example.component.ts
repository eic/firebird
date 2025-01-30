// shell-example.component.ts
import { Component, ViewChild } from '@angular/core';
import { DisplayShellComponent } from '../../components/display-shell/display-shell.component';
import {MatIcon} from "@angular/material/icon";
import {MatButton, MatIconButton} from "@angular/material/button";
import {MatFormField, MatLabel} from "@angular/material/form-field";

@Component({
  selector: 'app-shell-example',
  imports: [
    DisplayShellComponent,
    MatIcon,
    MatIconButton,
    MatLabel,
    MatButton,
    MatFormField
  ],
  templateUrl: './shell-example.component.html',
  styleUrls: ['./shell-example.component.scss']
})
export class ShellExampleComponent {

  @ViewChild(DisplayShellComponent)
  displayShellComponent!: DisplayShellComponent;

  toggleLeftPane() {
    this.displayShellComponent.toggleLeftPane();
  }

  toggleRightPane() {
    this.displayShellComponent.toggleRightPane();
  }

}
