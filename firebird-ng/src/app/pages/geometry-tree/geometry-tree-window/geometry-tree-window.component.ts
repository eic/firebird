import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Renderer2 } from '@angular/core';
import { MatIconButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { GeometryTreeComponent } from "../geometry-tree.component";
import { NgIf } from "@angular/common";

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
  sideNavOpen = true;
  isDetached = true;

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

  constructor(private renderer: Renderer2) {}

  ngAfterViewInit() {
    if (this.windowOpenState) {
      this.initDrag();
      this.initResize();
      this.updateMainContentShift();
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
        this.updateMainContentShift();
      });
    } else {
      this.removeDragListeners();
      this.removeResizeListeners();
      this.updateMainContentShift();
    }
  }

  toggleSideNav() {
    this.isDetached = !this.isDetached;

    if (!this.isDetached) {

      this.sideNavOpen = true;
      this.renderer.setStyle(this.windowContainer.nativeElement, 'left', '0px');
      this.renderer.setStyle(this.windowContainer.nativeElement, 'top', '60px');
      this.renderer.setStyle(this.windowContainer.nativeElement, 'position', 'fixed');
      this.renderer.setStyle(this.windowContainer.nativeElement, 'width', '300px');
      this.renderer.setStyle(this.windowContainer.nativeElement, 'height', '100vh');
      this.removeDragListeners();
    } else {

      this.sideNavOpen = false;
      this.renderer.setStyle(this.windowContainer.nativeElement, 'position', 'absolute');
      this.renderer.setStyle(this.windowContainer.nativeElement, 'width', '400px');
      this.renderer.setStyle(this.windowContainer.nativeElement, 'height', '400px');
      this.initDrag();
    }
    this.updateMainContentShift();
  }



  updateMainContentShift() {
    const mainContentElement = document.getElementById('eventDisplay');
    if (mainContentElement) {
      if (this.windowOpenState && !this.isDetached) {
        this.renderer.addClass(mainContentElement, 'shifted');
      } else {
        this.renderer.removeClass(mainContentElement, 'shifted');
      }
    }
  }

  initDrag() {
    if (!this.windowContainer || !this.isDetached) return;

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


        if (this.sideNavOpen) {
          windowElement.style.width = windowElement.offsetWidth + dx + 'px';
        } else {
          windowElement.style.width = windowElement.offsetWidth + dx + 'px';
          windowElement.style.height = windowElement.offsetHeight + dy + 'px';
        }
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
}
