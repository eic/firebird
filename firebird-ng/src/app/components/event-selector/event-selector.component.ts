import { Component } from '@angular/core';
import { DataModelService } from '../../services/data-model.service';
import { MatTooltip } from '@angular/material/tooltip';
import { NgForOf, NgIf } from '@angular/common';

@Component({
  selector: 'app-custom-event-selector',
  templateUrl: './event-selector.component.html',
  styleUrls: ['./event-selector.component.scss'],
  imports: [MatTooltip, NgForOf, NgIf],
  standalone: true,
})
export class EventSelectorComponent {
  constructor(private dataModelService: DataModelService) {}

  // Expose signals directly
  entries = this.dataModelService.entries;
  currentEntry = this.dataModelService.currentEntry;

  changeEntry(evt: Event) {
    const select = evt.target as HTMLSelectElement;
    const selectedIndex = select.selectedIndex;
    const selectedEntry = this.entries()[selectedIndex];

    if (selectedEntry) {
      this.dataModelService.setCurrentEntryByName(selectedEntry.id);
    }
  }
}
