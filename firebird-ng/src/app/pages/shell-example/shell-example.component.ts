import {Component, ViewChild} from '@angular/core';
import {DisplayShellComponent} from "../../components/display-shell/display-shell.component";

@Component({
    selector: 'app-shell-example',
    imports: [
        DisplayShellComponent
    ],
    templateUrl: './shell-example.component.html',
    styleUrl: './shell-example.component.scss'
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
