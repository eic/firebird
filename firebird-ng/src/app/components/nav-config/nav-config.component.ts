import {Component, HostListener} from '@angular/core';
import {RouterLink, RouterOutlet} from "@angular/router";
import {MatIcon} from "@angular/material/icon";
import {NgIf} from "@angular/common";
import {MatIconButton} from "@angular/material/button";
import {MatTooltip} from "@angular/material/tooltip";
import {MatMenu, MatMenuItem, MatMenuTrigger} from "@angular/material/menu";
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import packageInfo from '../../../../package.json';

@Component({
  selector: 'app-nav-config',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    MatIcon,
    NgIf,
    MatIconButton,
    MatTooltip,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger
  ],
  templateUrl: './nav-config.component.html',
  styleUrl: './nav-config.component.scss'
})
export class NavConfigComponent {
  isNavConfigOpen: boolean = false;
  isSmallScreen: boolean = window.innerWidth < 992;
  packageVersion: string;

  constructor(private matIconRegistry: MatIconRegistry,
              private domSanitizer: DomSanitizer) {
    this.matIconRegistry.addSvgIcon(
      'github',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/github-mark-white.svg')
    );
    this.packageVersion = packageInfo.version;
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.isSmallScreen = event.target.innerWidth < 768;
    if (!this.isSmallScreen) {
      this.isNavConfigOpen = true;
    }
  }

  toggleNavConfig() {
    this.isNavConfigOpen = !this.isNavConfigOpen;
  }
}
