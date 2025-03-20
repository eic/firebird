import {Component, Input, Output, EventEmitter, inject, computed, Signal} from '@angular/core';
import { MatSliderModule } from '@angular/material/slider';
import { DecimalPipe } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import {EventDisplayService} from "../../services/event-display.service";

@Component({
  selector: 'app-event-time-control',
  standalone: true,
  imports: [MatSliderModule, MatInputModule, DecimalPipe],
  templateUrl: './event-time-control.component.html',
  styleUrls: ['./event-time-control.component.scss']
})
export class EventTimeControlComponent {
  constructor(public eventDisplayService: EventDisplayService) {}

  public shownTime: Signal<number> = computed(()=>{
    const edTime = this.eventDisplayService.eventTime();
    if(edTime === null || edTime === undefined) {
      return this.eventDisplayService.minTime;
    }
    return edTime;
  })
  /**
   * Called whenever the slider input changes.
   * It extracts the new value and updates the service's time.
   */
  changeCurrentTime(event: Event): void {
    if (!event) return;
    const input = event.target as HTMLInputElement;
    const value = parseFloat(input.value);
    this.eventDisplayService.updateEventTime(value);
  }

  /**
   * A function to format the numeric slider value to display e.g. 1 decimal place.
   */
  formatCurrentTime(value: number): string {
    return value.toFixed(1);
  }


}
