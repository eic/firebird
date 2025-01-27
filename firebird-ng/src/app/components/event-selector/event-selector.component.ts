import { Component, type OnInit } from '@angular/core';
import {EventDisplayService} from "phoenix-ui-components";
import {MatTooltip} from "@angular/material/tooltip";
import {NgForOf, NgIf} from "@angular/common";


@Component({
    selector: 'app-custom-event-selector',
    templateUrl: './event-selector.component.html',
    styleUrls: ['./event-selector.component.scss'],
    imports: [
        MatTooltip,
        NgForOf,
        NgIf
    ]
})
export class EventSelectorComponent implements OnInit {
  // Array containing the keys of the multiple loaded events
  events: string[] = [];

  constructor(private eventDisplay: EventDisplayService) {}

  ngOnInit() {
    this.eventDisplay.listenToLoadedEventsChange(
      (events) => (this.events = events),
    );
  }

  changeEvent(selected: any) {
    const value = selected.target.value;
    this.eventDisplay.loadEvent(value);
  }
}
