import { Component, Input } from '@angular/core';
import {NgClass} from "@angular/common";
import {MatTooltip} from "@angular/material/tooltip";

@Component({
  selector: 'app-custom-menu-toggle',
  templateUrl: './menu-toggle.component.html',
  styleUrls: ['./menu-toggle.component.scss'],
  imports: [
    NgClass,
    MatTooltip
  ],
  standalone: true
})
export class MenuToggleComponent {
  @Input() icon: string = '';
  @Input() active: boolean = false;
  @Input() tooltip: string = '';
  @Input() disabled: boolean = false;
}
