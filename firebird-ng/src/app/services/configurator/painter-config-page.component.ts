import {
  AfterViewInit, Component, Inject, OnInit, ViewChild, ViewContainerRef
} from '@angular/core';
import {DOCUMENT, NgForOf} from '@angular/common';
import { TrackPainterConfig } from '../track-painter-config';
import { ConfiguratorRegistryService } from './configurator-registry.service';
import { TrackConfiguratorComponent } from './track-configurator.component';
import {MatList, MatListItem} from "@angular/material/list";

@Component({
  selector: 'app-painter-config-page',
  standalone: true,
  template: `
    <div class="layout">
      <div class="left">
        <mat-list>
          <mat-list-item *ngFor="let item of configItems"
                         [class.selected]="selectedItem === item"
                         (click)="selectItem(item)">
            {{item.name}}
          </mat-list-item>
        </mat-list>
      </div>
      <div class="right">
        <ng-container #configuratorContainer></ng-container>
      </div>
    </div>
  `,
  styles: [`.layout { display: flex; } .left { width: 200px; } .right { flex: 1; padding: 1rem; }`],
  imports: [
    MatList,
    MatListItem,
    NgForOf,
  ]
})
export class PainterConfigPageComponent implements OnInit, AfterViewInit {
  configItems = [
    { name: 'Track A', type: 'track', config: new TrackPainterConfig() },
  ];

  selectedItem: any = null;

  @ViewChild('configuratorContainer', { read: ViewContainerRef }) configuratorContainer!: ViewContainerRef;

  constructor(
    private registry: ConfiguratorRegistryService,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {}

  ngAfterViewInit(): void {
  if (this.configItems.length > 0) {
    setTimeout(() => this.selectItem(this.configItems[0]));
  }
}


  selectItem(item: any): void {
    this.selectedItem = item;
    this.loadConfiguratorComponent(item);
  }

  loadConfiguratorComponent(item: any): void {
    this.configuratorContainer.clear();
    const componentType = this.registry.getComponent(item.type);
    if (componentType) {
      const componentRef = this.configuratorContainer.createComponent(componentType);
      componentRef.instance.config = item.config;
      componentRef.instance.configChanged.subscribe((updated: any) => {
        console.log('Config updated:', updated);
      });
    }
  }
}
