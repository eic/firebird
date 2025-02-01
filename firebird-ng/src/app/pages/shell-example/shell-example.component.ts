// shell-example.component.ts
import { Component, ViewChild } from '@angular/core';
import { ShellComponent } from '../../components/shell/shell.component';
import {MatIcon} from "@angular/material/icon";
import {MatButton, MatIconButton} from "@angular/material/button";
import {MatFormField, MatLabel} from "@angular/material/form-field";
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
// Add if you're using <form> or ngModel, etc.
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import {ThemeSwitcherComponent} from "../../components/theme-switcher/theme-switcher.component";
import {MatCard, MatCardContent, MatCardTitle} from "@angular/material/card";
import {MatGridList, MatGridTile} from "@angular/material/grid-list";
import {NgForOf, NgStyle} from "@angular/common";

@Component({
  selector: 'app-shell-example',
  imports: [
    ShellComponent,
    MatIcon,
    MatIconButton,
    MatLabel,
    MatButton,
    MatFormField,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    ThemeSwitcherComponent,
    MatCard,
    MatCardTitle,
    MatCardContent,
    MatGridList,
    MatGridTile,
    NgStyle,
    NgForOf
  ],
  templateUrl: './shell-example.component.html',
  styleUrls: ['./shell-example.component.scss']
})
export class ShellExampleComponent {

  @ViewChild(ShellComponent)
  displayShellComponent!: ShellComponent;

  // Define a list of swatches with labels and CSS variable colors
  colorSwatches = [
    { label: 'Surface', color: 'var(--mat-sys-surface)' },
    { label: 'Surface Container', color: 'var(--mat-sys-surface-container)' },
    { label: 'Surface Bright', color: 'var(--mat-sys-surface-bright)' },
    { label: 'Primary', color: 'var(--mat-sys-primary)' },
    { label: 'Primary Container', color: 'var(--mat-sys-primary-container)' },
    { label: 'Secondary', color: 'var(--mat-sys-secondary)' },
    { label: 'Secondary Container', color: 'var(--mat-sys-secondary-container)' },
    { label: 'Tertiary', color: 'var(--mat-sys-tertiary)' },
    { label: 'Tertiary Container', color: 'var(--mat-sys-tertiary-container)' },
    { label: 'Error', color: 'var(--mat-sys-error)' },
    { label: 'Error Container', color: 'var(--mat-sys-error-container)' },
  ];


  toggleLeftPane() {
    this.displayShellComponent.toggleLeftPane();
  }

  toggleRightPane() {
    this.displayShellComponent.toggleRightPane();
  }

}
