import { Component, type OnInit } from '@angular/core';
import {EventDisplayService} from "phoenix-ui-components";
import {MenuToggleComponent} from "../menu-toggle/menu-toggle.component";

@Component({
  selector: 'app-custom-dark-theme',
  templateUrl: './dark-theme.component.html',
  styleUrls: ['./dark-theme.component.scss'],
  imports: [
    MenuToggleComponent
  ],
  standalone: true
})
export class DarkThemeComponent implements OnInit {
  darkTheme = false;

  constructor(private eventDisplay: EventDisplayService) {}

  ngOnInit(): void {
    this.darkTheme = this.eventDisplay.getUIManager().getDarkTheme();
  }

  setDarkTheme() {
    this.darkTheme = !this.darkTheme;
    this.eventDisplay.getUIManager().setDarkTheme(this.darkTheme);
  }
}
