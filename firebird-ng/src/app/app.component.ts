import { Component } from '@angular/core';
import { RouterOutlet, RouterModule, Router} from '@angular/router';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import {BehaviorSubject, Subject} from "rxjs";
import {IoOptionsComponent} from "./components/io-options/io-options.component";
import {PhoenixUIModule} from "phoenix-ui-components";
@Component({
  selector: 'app-root',
  standalone: true,
    imports: [RouterOutlet, RouterModule, IoOptionsComponent, PhoenixUIModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Firebird';
}
