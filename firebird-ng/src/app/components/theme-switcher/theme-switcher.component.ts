// theme-switcher.component.ts
import { Component, OnInit } from '@angular/core';
import * as THREE from 'three';
import { ThreeService } from '../../services/three.service';
import {MenuToggleComponent} from "../menu-toggle/menu-toggle.component";

@Component({
  selector: 'app-custom-dark-theme',
  templateUrl: './theme-switcher.component.html',
  styleUrls: ['./theme-switcher.component.scss'],
  imports: [
    MenuToggleComponent
  ]
})
export class ThemeSwitcherComponent implements OnInit {
  darkTheme = false;
  threeDarkBackground = new THREE.Color(0x3f3f3f);
  threeLightBackground = new THREE.Color(0xf3f3f3);

  constructor(private threeService: ThreeService) {}

  ngOnInit(): void {
    this.darkTheme = false;
    this.updateSceneBackground();
  }

  toggleTheme(): void {
    this.darkTheme = !this.darkTheme;
    // toggle theme-specific classes
    if (this.darkTheme) {
      console.log('Adding dark-theme class');
      document?.documentElement?.classList.add('dark-theme');
      document?.documentElement?.classList.remove('light-theme');
    } else {
      console.log('Adding light-theme class');
      document?.documentElement?.classList.add('light-theme');
      document?.documentElement?.classList.remove('dark-theme');
    }

    this.updateSceneBackground();
  }

  private updateSceneBackground(): void {
    if (this.threeService?.scene) {
      this.threeService.scene.background = this.darkTheme
        ? this.threeDarkBackground
        : this.threeLightBackground;
    }
  }
}
