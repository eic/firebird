import {
  Component,
  HostListener,
  ViewChild,
  ViewContainerRef,
  ComponentRef,
  Type,
} from '@angular/core';
import { CommonModule } from '@angular/common'; // Add this import

@Component({
  selector: 'app-display-shell',
  templateUrl: './display-shell.component.html',
  styleUrls: ['./display-shell.component.scss'],
  imports: [CommonModule],
  standalone: true,
})
export class DisplayShellComponent {
  @ViewChild('leftPaneContainer', { read: ViewContainerRef, static: true })
  leftPaneContainer!: ViewContainerRef;
  @ViewChild('rightPaneContainer', { read: ViewContainerRef, static: true })
  rightPaneContainer!: ViewContainerRef;

  isResizingLeft = false;
  isResizingRight = false;
  leftPaneWidth = 250;
  rightPaneWidth = 250;

  isLeftPaneVisible = true;
  isRightPaneVisible = false;


  onMouseDownLeft(event: MouseEvent) {
    this.isResizingLeft = true;
    event.preventDefault();
  }

  onMouseDownRight(event: MouseEvent) {
    this.isResizingRight = true;
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.isResizingLeft) {
      const minWidth = 100;
      const maxWidth = window.innerWidth - this.rightPaneWidth - 100;
      let newWidth = event.clientX;
      this.leftPaneWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
      event.preventDefault();
    } else if (this.isResizingRight) {
      const minWidth = 100;
      const maxWidth = window.innerWidth - this.leftPaneWidth - 100;
      let newWidth = window.innerWidth - event.clientX;
      this.rightPaneWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
      event.preventDefault();
    }
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    this.isResizingLeft = false;
    this.isResizingRight = false;
  }

  // Method to add a component to left pane programmatically
  addComponentToLeftPane<T>(component: Type<T>, data?: Partial<T>): ComponentRef<T> {
    this.leftPaneContainer.clear();
    const componentRef = this.leftPaneContainer.createComponent(component);
    if (data) {
      Object.assign(componentRef.instance as object, data);
    }
    return componentRef;
  }

  // Method to add a component to right pane programmatically
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
  }

  toggleRightPane() {
    this.isRightPaneVisible = !this.isRightPaneVisible;
  }
}
