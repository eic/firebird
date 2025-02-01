import {Component, OnDestroy, OnInit, TemplateRef} from '@angular/core';
import {MatDrawer, MatDrawerContainer, MatDrawerContent} from "@angular/material/sidenav";
import {MatToolbar} from "@angular/material/toolbar";
import {MatButton, MatIconButton} from "@angular/material/button";
import {MatIcon} from "@angular/material/icon";
import {MatListItem, MatNavList} from "@angular/material/list";
import {Router, RouterLink} from "@angular/router";
import {Subject, takeUntil} from "rxjs";
import {ThemeSwitcherComponent} from "../theme-switcher/theme-switcher.component";
import {HeaderService} from "../../services/header.service";
import {NgForOf, NgIf, NgOptimizedImage, NgTemplateOutlet} from "@angular/common";

interface NavItem {
  label: string;
  route: string;
  external?: boolean;
  icon?: string;
  alwaysVisible?: boolean;
}

@Component({
  selector: 'app-header',
  imports: [
    MatDrawerContent,
    MatToolbar,
    MatIconButton,
    MatIcon,
    MatDrawerContainer,
    MatDrawer,
    MatNavList,
    MatListItem,
    RouterLink,
    MatButton,
    ThemeSwitcherComponent,
    NgForOf,
    NgIf,
    NgOptimizedImage,
    NgTemplateOutlet,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  /** Controls mobile nav overlay. */
  navOpen = false;
  isDarkTheme = false;

  /** Template from the current page for the middle of the toolbar. */
  middleTemplate: TemplateRef<any> | null = null;

  /** Example version label. Could come from package.json or environment. */
  packageVersion = '0.1.25';

  /** Single source array for all nav items. */
  navItems: NavItem[] = [
    { label: 'Display', route: '/display', icon: 'monitor', alwaysVisible: true },
    { label: 'Configure', route: '/config', icon: 'tune', alwaysVisible: true },
    { label: 'GitHub Repo', route: 'https://github.com/eic/firebird', external: true, icon: 'code', alwaysVisible: false },
    { label: 'Submit Ideas', route: 'https://github.com/eic/firebird/issues', external: true, icon: 'feedback', alwaysVisible: false }
  ];

  constructor(
    private headerService: HeaderService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Listen for any page-specific controls
    this.headerService.middleControls$
      .pipe(takeUntil(this.destroy$))
      .subscribe(templateRef => {
        this.middleTemplate = templateRef;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleNavConfig(): void {
    this.navOpen = !this.navOpen;
  }

  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    document.documentElement.setAttribute('data-theme', this.isDarkTheme ? 'dark' : 'light');
  }

  /**
   * Called when the user clicks a nav item.
   * If external => open in new tab
   * If internal => use the Angular router
   * Then close the mobile overlay.
   */
  onNavItemClick(item: NavItem): void {
    if (item.external) {
      window.open(item.route, '_blank');
    } else {
      this.router.navigateByUrl(item.route);
    }
    this.navOpen = false; // Close after click
  }
}
