import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import {MatIconButton} from "@angular/material/button";
import {MatIcon} from "@angular/material/icon";
import {GeometryTreeComponent} from "../geometry-tree.component";
import {NgIf} from "@angular/common";

@Component({
  selector: 'geometry-tree-window',
  templateUrl: 'geometry-tree-window.component.html',
  styleUrls: ['geometry-tree-window.component.scss'],
  imports: [
    MatIconButton,
    MatIcon,
    GeometryTreeComponent,
    NgIf
  ],
  standalone: true
})
export class GeometryTreeWindowComponent implements AfterViewInit, OnDestroy {
  windowOpenState = false;
  sideNavOpen = false;

  @ViewChild('windowContainer', { static: false }) windowContainer!: ElementRef;
  @ViewChild('windowHeader', { static: false }) windowHeader!: ElementRef;
  @ViewChild('resizeHandle', { static: false }) resizeHandle!: ElementRef;

  private isDragging = false;
  private isResizing = false;
  private lastX = 0;
  private lastY = 0;

  private dragMouseMoveHandler: any;
  private dragMouseUpHandler: any;
  private resizeMouseMoveHandler: any;
  private resizeMouseUpHandler: any;

  ngAfterViewInit() {
    if (this.windowOpenState) {
      this.initDrag();
      this.initResize();
    }
  }

  ngOnDestroy() {
    this.removeDragListeners();
    this.removeResizeListeners();
  }

  toggleWindow() {
    this.windowOpenState = !this.windowOpenState;

    if (this.windowOpenState) {
      setTimeout(() => {
        this.initDrag();
        this.initResize();
      });
    } else {
      this.removeDragListeners();
      this.removeResizeListeners();
    }
  }

  initDrag() {
    if (!this.windowContainer) return;

    const windowElement = this.windowContainer.nativeElement;

    windowElement.addEventListener('mousedown', (e: MouseEvent) => {
      if ((<HTMLElement>e.target).classList.contains('window-header')) {
        this.isDragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        e.preventDefault();
      }
    });

    this.dragMouseMoveHandler = (e: MouseEvent) => {
      if (this.isDragging) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;

        const rect = windowElement.getBoundingClientRect();
        windowElement.style.left = rect.left + dx + 'px';
        windowElement.style.top = rect.top + dy + 'px';

        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    };

    this.dragMouseUpHandler = () => {
      this.isDragging = false;
    };

    document.addEventListener('mousemove', this.dragMouseMoveHandler);
    document.addEventListener('mouseup', this.dragMouseUpHandler);
  }

  initResize() {
    if (!this.resizeHandle || !this.windowContainer) return;

    const resizeHandle = this.resizeHandle.nativeElement;
    const windowElement = this.windowContainer.nativeElement;

    resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
      this.isResizing = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      e.preventDefault();
    });

    this.resizeMouseMoveHandler = (e: MouseEvent) => {
      if (this.isResizing) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;

        windowElement.style.width = windowElement.offsetWidth + dx + 'px';
        windowElement.style.height = windowElement.offsetHeight + dy + 'px';

        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    };

    this.resizeMouseUpHandler = () => {
      this.isResizing = false;
    };

    document.addEventListener('mousemove', this.resizeMouseMoveHandler);
    document.addEventListener('mouseup', this.resizeMouseUpHandler);
  }

  removeDragListeners() {
    if (this.dragMouseMoveHandler && this.dragMouseUpHandler) {
      document.removeEventListener('mousemove', this.dragMouseMoveHandler);
      document.removeEventListener('mouseup', this.dragMouseUpHandler);
    }
  }

  removeResizeListeners() {
    if (this.resizeMouseMoveHandler && this.resizeMouseUpHandler) {
      document.removeEventListener('mousemove', this.resizeMouseMoveHandler);
      document.removeEventListener('mouseup', this.resizeMouseUpHandler);
    }
  }

  toggleSideNav() {
    this.sideNavOpen = !this.sideNavOpen;

    if (this.sideNavOpen) {
      this.windowContainer.nativeElement.style.left = '0px';
      this.windowContainer.nativeElement.style.width = '400px';
    } else {
      this.windowContainer.nativeElement.style.width = '';
    }
  }

}
