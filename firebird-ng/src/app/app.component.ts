import { Component } from '@angular/core';
import { RouterOutlet, RouterModule, Router} from '@angular/router';


@Component({
    selector: 'app-root',
  imports: [RouterOutlet, RouterModule],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Firebird';
}
