import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  input,
  output,
} from '@angular/core';
import { EventDisplayService } from '../../services/event-display.service';

/**
 * The event display: the shared three.js canvas, filling this element.
 *
 * On creation it attaches the display here (`EventDisplayService.attach()`):
 * the canvas and the main view move in, the canvas follows the element's
 * size, the configured geometry and events load, and the queued startup
 * commands run. On destruction it detaches again; the scene and the loaded
 * data stay for the next `<firebird-display>`.
 *
 * Give the element a definite size (the default styles fill the parent).
 * Content projected into it sits in front of the canvas, positioned by the
 * host page: the quad view places its view cells there.
 *
 * ```html
 * <firebird-display (attached)="addMyViews()"></firebird-display>
 * ```
 */
@Component({
  selector: 'firebird-display',
  template: '<ng-content />',
  styles: ':host { display: block; position: relative; width: 100%; height: 100%; overflow: hidden; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FirebirdDisplayComponent implements AfterViewInit, OnDestroy {
  /**
   * Loads the configured geometry and events once attached. Default true;
   * the queued startup commands run either way.
   */
  readonly autoLoad = input(true);

  /**
   * Emits once the renderer is attached here, before the configured sources
   * load: the moment for setup that needs the scene (extra views, panels).
   */
  readonly attached = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly eventDisplay = inject(EventDisplayService);
  private detach?: () => void;

  ngAfterViewInit(): void {
    this.detach = this.eventDisplay.attach(this.host.nativeElement, {
      autoLoad: this.autoLoad(),
      onAttached: () => this.attached.emit(),
    });
  }

  ngOnDestroy(): void {
    this.detach?.();
  }
}
