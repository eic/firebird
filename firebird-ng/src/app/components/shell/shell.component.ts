import {
  Component,
  HostListener,
  ViewChild,
  ViewContainerRef,
  ComponentRef,
  Type,
  EventEmitter,
  Output, ElementRef, Input, OnInit, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {Router, NavigationStart} from '@angular/router';
import {Subscription} from 'rxjs';
import {filter} from 'rxjs/operators';
// Angular Material imports for the top bar
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import {ThemeSwitcherComponent} from "../theme-switcher/theme-switcher.component";
import {MatTooltip} from "@angular/material/tooltip";

interface NavItem {
  label: string;
  route: string;
  external?: boolean;
  icon?: string;
  /** If true, shows up on wide screens directly. Otherwise in hamburger. */
  alwaysVisible?: boolean;
}

@Component({
  standalone: true,
  selector: 'app-shell',
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss'],
  imports: [
    CommonModule,
    // Material modules needed for the top bar
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    ThemeSwitcherComponent,
    MatTooltip
  ],
})
export class ShellComponent implements OnInit, OnDestroy {

  private routerSubscription?: Subscription;

  /** The reference to the left container, for programmatic component creation */
  @ViewChild('leftPaneContainer', { read: ViewContainerRef, static: true })
  leftPaneContainer!: ViewContainerRef;

  /** The reference to the right container, for programmatic component creation */
  @ViewChild('rightPaneContainer', { read: ViewContainerRef, static: true })
  rightPaneContainer!: ViewContainerRef;

  /** The reference to main content container */
  @ViewChild('mainContent', { static: true }) mainContent!: ElementRef<HTMLElement>;

  /** Event emitted when the resizing of the left pane ends. Emits the new width. */
  @Output() onEndResizeLeft = new EventEmitter<number>();

  /** Event emitted when the resizing of the right pane ends. Emits the new width. */
  @Output() onEndResizeRight = new EventEmitter<number>();

  /** Event emitted when the visibility of the right panel is changed. */
  @Output() onVisibilityChangeRight = new EventEmitter<boolean>();

  /** Event emitted when the visibility of the left panel is changed. */
  @Output() onVisibilityChangeLeft = new EventEmitter<boolean>();

  /** Is left Pane visible by default */
  @Input()
  isLeftPaneVisible = false;

  /** Is right Pane visible by default */
  @Input()
  isRightPaneVisible = false;

  /** Shell resizing logic */
  private isResizingLeft = false;
  private isResizingRight = false;
  leftPaneWidth = 250;
  rightPaneWidth = 250;

  /** Top bar: whether the mobile nav menu is open */
  navOpen = false;
  /** Top bar: whether the mobile tools menu is open */
  toolsOpen = false;
  /** Track current theme (light or dark) */
  isDarkTheme = false;

  /** Single place for nav items */
  navItems: NavItem[] = [
    { label: 'Help', route: 'https://eic.github.io/firebird/', external: true, icon: 'menu_book', alwaysVisible: true },
    { label: 'Display', route: '/display', icon: 'monitor', alwaysVisible: true },
    { label: 'Configure', route: '/config', icon: 'tune', alwaysVisible: true },
    { label: 'GitHub Repo', route: 'https://github.com/eic/firebird', external: true, icon: 'code' },
    { label: 'Submit Ideas', route: 'https://github.com/eic/firebird/issues', external: true, icon: 'feedback' },
  ];

  constructor(
    private router: Router
  ) {}

  ngOnInit() {
    // Close mobile menus on any navigation
    this.routerSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationStart)
    ).subscribe(() => {
      this.navOpen = false;
      this.toolsOpen = false;
    });
  }

  ngOnDestroy() {
    this.routerSubscription?.unsubscribe();
  }

  /** Resizing logic for left pane */
  onMouseDownLeft(event: MouseEvent) {
    this.isResizingLeft = true;
    event.preventDefault();
  }

  /** Resizing logic for right pane */
  onMouseDownRight(event: MouseEvent) {
    this.isResizingRight = true;
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.isResizingLeft) {
      const minWidth = 100;
      const maxWidth = window.innerWidth - this.rightPaneWidth - 100;
      const newWidth = event.clientX;
      this.leftPaneWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
      event.preventDefault();
    } else if (this.isResizingRight) {
      const minWidth = 100;
      const maxWidth = window.innerWidth - this.leftPaneWidth - 100;
      const newWidth = window.innerWidth - event.clientX;
      this.rightPaneWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
      event.preventDefault();
    }
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    if (this.isResizingLeft) {
      this.isResizingLeft = false;
      this.onEndResizeLeft.emit(this.leftPaneWidth);
    }
    if (this.isResizingRight) {
      this.isResizingRight = false;
      this.onEndResizeRight.emit(this.rightPaneWidth);
    }
  }

  /** Programmatically add component to left pane */
  addComponentToLeftPane<T>(component: Type<T>, data?: Partial<T>): ComponentRef<T> {
    this.leftPaneContainer.clear();
    const componentRef = this.leftPaneContainer.createComponent(component);
    if (data) {
      Object.assign(componentRef.instance as object, data);
    }
    return componentRef;
  }

  /** Programmatically add component to right pane */
  addComponentToRightPane<T>(component: Type<T>, data?: Partial<T>): ComponentRef<T> {
    this.rightPaneContainer.clear();
    const componentRef = this.rightPaneContainer.createComponent(component);
    if (data) {
      Object.assign(componentRef.instance as object, data);
    }
    return componentRef;
  }

  toggleLeftPane() {
    this.isLeftPaneVisible = !this.isLeftPaneVisible;
    this.onVisibilityChangeLeft.emit(this.isLeftPaneVisible);
  }

  toggleRightPane() {
    this.isRightPaneVisible = !this.isRightPaneVisible;
    this.onVisibilityChangeRight.emit(this.isRightPaneVisible);
  }

  /** Toggle the mobile navigation menu */
  toggleNavMenu() {
    this.navOpen = !this.navOpen;
    if (this.navOpen) {
      this.toolsOpen = false; // Close tools when opening nav
    }
  }

  /** Toggle the mobile tools menu */
  toggleToolsMenu() {
    this.toolsOpen = !this.toolsOpen;
    if (this.toolsOpen) {
      this.navOpen = false; // Close nav when opening tools
    }
  }

  /**
   * Returns the visible dimensions of the main content area.
   * Uses clientWidth/clientHeight to exclude scrollbars,
   * and subtracts side panel widths if they are visible.
   */
  getMainAreaVisibleDimensions(): { width: number; height: number } {


    const visibleWidth = this.mainContent.nativeElement.clientWidth -
      (this.isLeftPaneVisible ? this.leftPaneWidth : 0) -
      (this.isRightPaneVisible ? this.rightPaneWidth : 0);
    const visibleHeight = this.mainContent.nativeElement.clientHeight;


    console.log("Shell resize information: ")
    console.log("  mainContent.clientWidth:", this.mainContent.nativeElement.clientWidth);
    console.log("  mainContent.clientHeight:", this.mainContent.nativeElement.clientHeight);
    console.log("  isLeftPaneVisible:", this.isLeftPaneVisible);
    if(this.isLeftPaneVisible)
    {
      console.log("  leftPaneWidth:", this.leftPaneWidth);
    }
    console.log("  isRightPaneVisible:", this.isRightPaneVisible);
    if(this.isRightPaneVisible)
    {
      console.log("  rightPaneWidth:", this.rightPaneWidth);
    }
    console.log("  visibleWidth:", visibleWidth);
    console.log("  visibleHeight:", visibleHeight);

    return { width: visibleWidth, height: visibleHeight };
  }

  /** Clicking a nav item => external link or internal route */
  onNavItemClick(item: NavItem) {
    if (item.external) {
      window.open(item.route, '_blank');
    } else {
      this.router.navigateByUrl(item.route);
    }
    this.navOpen = false;
  }
}
