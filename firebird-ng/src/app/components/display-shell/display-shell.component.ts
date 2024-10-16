import {
  Component,
  HostListener,
  ViewChild,
  ViewContainerRef,
  ComponentRef,
  Type, EventEmitter, Output,
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

  /** The reference to the left container, so it could be programmatically set */
  @ViewChild('leftPaneContainer', { read: ViewContainerRef, static: true })
  leftPaneContainer!: ViewContainerRef;

  /** The reference to the right container, so it could be programmatically set */
  @ViewChild('rightPaneContainer', { read: ViewContainerRef, static: true })
  rightPaneContainer!: ViewContainerRef;

  /** Event emitted when the resizing of the left pane ends. Emits the new width
   *
   * @event
   */
  @Output() onEndResizeLeft = new EventEmitter<number>();

  /** Event emitted when the resizing of the right pane ends. Emits the new width
   *
   * @event
   */
  @Output() onEndResizeRight = new EventEmitter<number>();

  /** Event emitted when the visibility of right panel is changed. Emits the new width
   *
   * @event
   */
  @Output() onVisibilityChangeRight = new EventEmitter<boolean>();

  /** Event emitted when the visibility of left panel is changed. Emits the new width
   *
   * @event
   */
  @Output() onVisibilityChangeLeft = new EventEmitter<boolean>();


  /** Indicates whether the left pane is currently being resized. */
  private isResizingLeft: boolean = false;

  /** Indicates whether the right pane is currently being resized. */
  private isResizingRight: boolean = false;

  /** The current width of a left plane */
  leftPaneWidth = 250;

  /** The current width of a right plane */
  rightPaneWidth = 250;

  /** If left plane is visible or collapsed */
  isLeftPaneVisible = false;

  /** If right plane is visible or collapsed */
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
    if(this.isResizingLeft) {
      this.isResizingLeft = false;
      this.onEndResizeLeft.emit(this.leftPaneWidth);
    }

    if(this.isResizingRight) {
      this.isResizingRight = false;
      this.onEndResizeRight.emit(this.rightPaneWidth);
    }
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
    this.onVisibilityChangeLeft.emit(this.isLeftPaneVisible);
  }

  toggleRightPane() {
    this.isRightPaneVisible = !this.isRightPaneVisible;
    this.onVisibilityChangeRight.emit(this.isRightPaneVisible);
  }
}
