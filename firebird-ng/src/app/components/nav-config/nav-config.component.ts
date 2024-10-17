import {Component, HostListener} from '@angular/core';
import {RouterLink, RouterOutlet} from "@angular/router";
import {MatIcon} from "@angular/material/icon";
import {NgIf} from "@angular/common";
import {MatIconButton} from "@angular/material/button";
import {MatTooltip} from "@angular/material/tooltip";

@Component({
  selector: 'app-nav-config',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    MatIcon,
    NgIf,
    MatIconButton,
    MatTooltip
  ],
  templateUrl: './nav-config.component.html',
  styleUrl: './nav-config.component.scss'
})
export class NavConfigComponent {
  isNavConfigOpen: boolean = false;
  isSmallScreen: boolean = window.innerWidth < 992;

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
