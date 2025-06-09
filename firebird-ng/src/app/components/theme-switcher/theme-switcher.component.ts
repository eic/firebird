import {Component, computed, OnInit} from '@angular/core';
import { ThemeService, Theme } from '../../services/theme.service';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-theme-switcher',
  templateUrl: './theme-switcher.component.html',
  styleUrls: ['./theme-switcher.component.scss'],
  standalone: true,
  imports: [MatMenuModule, MatIconModule, MatButtonModule]
})
export class ThemeSwitcherComponent implements OnInit {
  /**
   * A computed signal that returns the appropriate Material icon name
   * based on the current theme stored in ThemeService.
   */
  public currentIcon = computed(() => {
    const theme = this.themeService.currentTheme();
    // Return the corresponding icon name based on the theme value.

    if(theme === 'system') {
      return 'settings_brightness';
    }
    return theme === "dark" ? 'dark_mode' : 'light_mode';
  });

  public systemIcon = computed(()=>
    this.themeService.getSystemTheme()=== "dark" ? 'dark_mode' : 'light_mode');

  /**
   * Creates an instance of ThemeSwitcherComponent.
   * @param themeService The ThemeService managing theme state via signals.
   */
  constructor(public themeService: ThemeService) {}

  ngOnInit(): void {
    this.themeService.initializeTheme();
  }

  /**
   * Handles user selection of a new theme from the menu.
   * This updates the global theme using ThemeService.
   * @param theme The new theme selected by the user.
   */
  selectTheme(theme: Theme): void {
    this.themeService.setTheme(theme);
  }
}
