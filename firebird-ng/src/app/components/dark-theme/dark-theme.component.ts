// dark-theme.component.ts
import { Component, OnInit } from '@angular/core';
import * as THREE from 'three';
import { ThreeService } from '../../services/three.service';
import {MenuToggleComponent} from "../menu-toggle/menu-toggle.component";

@Component({
  selector: 'app-custom-dark-theme',
  templateUrl: './dark-theme.component.html',
  styleUrls: ['./dark-theme.component.scss'],
  imports: [
    MenuToggleComponent
  ]
})
export class DarkThemeComponent implements OnInit {
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
    document.documentElement.setAttribute('data-theme', this.darkTheme ? 'dark' : 'light');
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
