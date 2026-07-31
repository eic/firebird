import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet, RouterModule, Router} from '@angular/router';


@Component({
    selector: 'app-root',
  imports: [RouterOutlet, RouterModule],
    templateUrl: './app.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Firebird';
}
