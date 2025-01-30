// event-selector.component.ts
import { Component } from '@angular/core';
import { DataModelService } from '../../services/data-model.service';
import { MatTooltip } from '@angular/material/tooltip';
import { NgForOf, NgIf } from '@angular/common';

@Component({
  selector: 'app-custom-event-selector',
  templateUrl: './event-selector.component.html',
  styleUrls: ['./event-selector.component.scss'],
  imports: [MatTooltip, NgForOf, NgIf],
})
export class EventSelectorComponent {
  constructor(private dataModelService: DataModelService) {}

  // Expose signals directly
  entries = this.dataModelService.entries;
  currentEntry = this.dataModelService.currentEntry;

  changeEntry(evt: Event) {
    const newEntry = (evt.target as HTMLSelectElement).value;
    this.dataModelService.setCurrentEntryByName(newEntry);
  }
}
