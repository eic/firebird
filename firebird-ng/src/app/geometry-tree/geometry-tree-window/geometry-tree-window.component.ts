import { Component, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
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
export class GeometryTreeWindowComponent implements AfterViewInit {
  windowOpenState = true;

  @ViewChild('windowContainer', { static: false }) windowContainer!: ElementRef;
  @ViewChild('windowHeader', { static: false }) windowHeader!: ElementRef;
  @ViewChild('resizeHandle', { static: false }) resizeHandle!: ElementRef;

  private isDragging = false;
  private isResizing = false;
  private lastX = 0;
  private lastY = 0;

  ngAfterViewInit() {
    if (this.windowOpenState) {
      this.initDrag();
      this.initResize();
    }
  }

  toggleWindow() {
    this.windowOpenState = !this.windowOpenState;

    if (this.windowOpenState) {
      setTimeout(() => {
        this.initDrag();
        this.initResize();
      });
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

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.isDragging) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;

        const rect = windowElement.getBoundingClientRect();
        windowElement.style.left = rect.left + dx + 'px';
        windowElement.style.top = rect.top + dy + 'px';

        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });

    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
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

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.isResizing) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;

        windowElement.style.width = windowElement.offsetWidth + dx + 'px';
        windowElement.style.height = windowElement.offsetHeight + dy + 'px';

        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });

    document.addEventListener('mouseup', () => {
      this.isResizing = false;
    });
  }
}
