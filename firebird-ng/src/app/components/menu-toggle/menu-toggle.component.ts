import { Component, Input } from '@angular/core';
import {NgClass} from "@angular/common";
import {MatTooltip} from "@angular/material/tooltip";
import {MatButton} from "@angular/material/button";
import {MatIcon} from "@angular/material/icon";

@Component({
    selector: 'app-custom-menu-toggle',
    templateUrl: './menu-toggle.component.html',
    styleUrls: ['./menu-toggle.component.scss'],
    imports: [
        NgClass,
        MatTooltip,
        MatButton,
        MatIcon
    ]
})
export class MenuToggleComponent {
  @Input() icon: string = '';
  @Input() active: boolean = false;
  @Input() tooltip: string = '';
  @Input() disabled: boolean = false;
}
