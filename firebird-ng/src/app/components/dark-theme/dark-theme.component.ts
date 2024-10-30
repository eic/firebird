import { Component, type OnInit } from '@angular/core';
import {EventDisplayService} from "phoenix-ui-components";
import {MenuToggleComponent} from "../menu-toggle/menu-toggle.component";
import * as THREE from 'three';

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
  threeDarkBackground = new THREE.Color( 0x3F3F3F );
  threeLightBackground = new THREE.Color( 0xF3F3F3 );

  constructor(private eventDisplay: EventDisplayService) { }

  ngOnInit(): void {
    this.darkTheme = this.eventDisplay.getUIManager().getDarkTheme();
  }

  setDarkTheme() {
    this.darkTheme = !this.darkTheme;
    const scene = this.eventDisplay.getThreeManager().getSceneManager().getScene();

    // Switch three.js background
    if(scene && this.darkTheme) {
      scene.background = this.threeDarkBackground;
    } else {
      scene.background = this.threeLightBackground;
    }
  }
}
