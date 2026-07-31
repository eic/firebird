import { ChangeDetectionStrategy, Component, ViewChild, model } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ShellLayoutComponent } from '@dexvis/shell';
import { ThemeSwitcherComponent } from '../theme-switcher/theme-switcher.component';
import packageJson from '../../../../package.json';

interface NavItem {
  label: string;
  route: string;
  external?: boolean;
  icon?: string;
  /** If true, shows up on wide screens directly. Otherwise in the logo menu. */
  alwaysVisible?: boolean;
}

/**
 * Firebird app chrome: wraps the generic @dexvis/shell layout and contributes
 * the Firebird-specific parts (logo menu, navigation, version, theme switcher).
 *
 * Pages project content using the @dexvis/shell slot names:
 * [header], [mobile-header], [mobile-tools], [left-pane], [central-pane],
 * [right-pane], [footer-left], [footer-center], [footer-right].
 */
@Component({
  selector: 'app-firebird-shell',
  standalone: true,
  templateUrl: './firebird-shell.component.html',
  styleUrls: ['./firebird-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ShellLayoutComponent,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    ThemeSwitcherComponent,
  ],
})
export class FirebirdShellComponent {
  /** Two-way bindable pane state, chained into the underlying shell layout. */
  readonly leftPaneVisible = model<boolean>(false);
  readonly rightPaneVisible = model<boolean>(false);

  @ViewChild(ShellLayoutComponent) layout?: ShellLayoutComponent;

  appVersion: string = packageJson.version;

  navItems: NavItem[] = [
    { label: 'Help', route: 'https://eic.github.io/firebird/', external: true, icon: 'menu_book', alwaysVisible: true },
    { label: 'Display', route: '/display', icon: 'monitor', alwaysVisible: true },
    { label: 'Configure', route: '/config', icon: 'tune', alwaysVisible: true },
    { label: 'GitHub Repo', route: 'https://github.com/eic/firebird', external: true, icon: 'code' },
    { label: 'Submit Ideas', route: 'https://github.com/eic/firebird/issues', external: true, icon: 'feedback' },
  ];

  get primaryNavItems(): NavItem[] {
    return this.navItems.filter(i => i.alwaysVisible);
  }

  get overflowNavItems(): NavItem[] {
    return this.navItems.filter(i => !i.alwaysVisible);
  }

  constructor(private router: Router) {}

  onNavItemClick(item: NavItem): void {
    if (item.external) {
      window.open(item.route, '_blank');
    } else {
      this.router.navigate([item.route]);
    }
  }

  toggleLeftPane(): void {
    this.leftPaneVisible.update(v => !v);
  }

  toggleRightPane(): void {
    this.rightPaneVisible.update(v => !v);
  }
}
