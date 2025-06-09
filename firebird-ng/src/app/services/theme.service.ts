import { Injectable, Inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ThreeService } from './three.service';
import * as THREE from 'three';
import {LocalStorageService} from "./local-storage.service";
import {ConfigProperty} from "../utils/config-property";

export type Theme = 'light' | 'dark' | 'system';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {

  /**
   * Signal holding the current theme.
   * Default is 'dark' when no theme is saved.
   */
  private _currentTheme = signal<Theme>('dark');

  /**
   * Exposed read-only signal for the current theme.
   */
  public readonly currentTheme = this._currentTheme.asReadonly();

  // Reference to the html element (if available)
  private _htmlElement?: HTMLHtmlElement;

  // Colors for three.js background for dark and light themes
  private readonly threeDarkBackground = new THREE.Color(0x3f3f3f);
  private readonly threeLightBackground = new THREE.Color(0xFFFFFF);

  // What user has in local storage
  private userSavedTheme: ConfigProperty<string>;

  /**
   * Creates an instance of ThemeService.
   * @param platformId Angular platform identifier.
   * @param threeService ThreeService used to update three.js scene background.
   * @param userConfigService User configs saved in local storage service
   */
  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private threeService: ThreeService,
    private userConfigService: LocalStorageService
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this._htmlElement = document.documentElement as HTMLHtmlElement;
    }

    this.userSavedTheme = this.userConfigService.uiSelectedTheme;
    this.initializeTheme();

  }

  /**
   * Determines the system's current theme using the browser's preference.
   * @returns 'light' or 'dark' based on the media query.
   */
  public getSystemTheme(): 'light' | 'dark' {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }



  /**
   * Initializes the theme on application startup.
   * If no saved theme is found, the default is 'dark'.
   */
  public initializeTheme(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const saved = this.userSavedTheme.value || 'dark';
    this.setTheme(saved as Theme);
  }

  /**
   * Sets the application theme.
   * When 'system' is selected, the system's color scheme is used.
   * This method updates local storage, the html element's attributes,
   * the Angular signal, and the three.js scene background via ThreeService.
   *
   * @param theme The theme to set ('light', 'dark', or 'system').
   */
  public setTheme(theme: Theme): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.userSavedTheme.value = theme;

    // Update the signal.
    this._currentTheme.set(theme);

    // Determine the applied theme (for 'system', use the current system preference).
    const appliedTheme: 'light' | 'dark' = theme === 'system' ? this.getSystemTheme() : theme;

    // Set the html element's color-scheme attribute.
    this._htmlElement?.setAttribute('style', `color-scheme: ${appliedTheme};`);

    // Toggle theme-specific classes on the html element.
    if (appliedTheme === 'dark') {
      this._htmlElement?.classList.add('dark-theme');
      this._htmlElement?.classList.remove('light-theme');
    } else {
      this._htmlElement?.classList.add('light-theme');
      this._htmlElement?.classList.remove('dark-theme');
    }

    // Update the three.js scene background using ThreeService.
    if (this.threeService?.scene) {
      this.threeService.scene.background = appliedTheme === 'dark'
        ? this.threeDarkBackground
        : this.threeLightBackground;
    }
  }

  /**
   * Convenience method to retrieve the current theme value.
   * This can be used by UI components to determine which icon to show on startup.
   *
   * @returns The current theme ('light', 'dark', or 'system').
   */
  public getCurrentTheme(): Theme {
    return this._currentTheme();
  }
}
