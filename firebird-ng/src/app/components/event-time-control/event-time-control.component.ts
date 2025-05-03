import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  computed,
  Signal,
  ViewChild,
  TemplateRef,
  ElementRef
} from '@angular/core';
import { MatSliderModule } from '@angular/material/slider';
import {DecimalPipe, NgIf} from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import {EventDisplayService} from "../../services/event-display.service";
import {FormsModule} from "@angular/forms";
import {MatButton, MatIconButton} from "@angular/material/button";
import {MatIcon} from "@angular/material/icon";
import {MatTooltip} from "@angular/material/tooltip";
import {MatDialog, MatDialogClose, MatDialogRef} from "@angular/material/dialog";

@Component({
  selector: 'app-event-time-control',
  standalone: true,
  imports: [MatSliderModule, MatInputModule, DecimalPipe, MatButton, NgIf, FormsModule, MatIcon, MatIconButton, MatTooltip, MatDialogClose],
  templateUrl: './event-time-control.component.html',
  styleUrls: ['./event-time-control.component.scss']
})
export class EventTimeControlComponent {
  private dialog = inject(MatDialog);
  animationSpeed: number = 1.0;


  @ViewChild('openBtn', { read: ElementRef }) openBtn!: ElementRef;
  @ViewChild('dialogTemplate') dialogTemplate!: TemplateRef<any>;
  dialogRef: MatDialogRef<any> | null = null;


  customStartTime = this.eventDisplayService.minTime;
  customEndTime = this.eventDisplayService.maxTime;

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

  onThumbInput(event: Event): void {
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


  openDialog(): void {
  if (this.dialogRef) {
    this.dialogRef.close();
    return;
  }

    const rect = this.openBtn.nativeElement.getBoundingClientRect();
    const dialogWidth =  this.dialogTemplate?.elementRef.nativeElement.offsetWidth || 320;


    const left = rect.right - dialogWidth;

    this.dialogRef = this.dialog.open(this.dialogTemplate, {
      position: {
        bottom: `${window.innerHeight - rect.bottom + 55}px`,
        left: `${Math.max(left, 0)}px`
      },
      hasBackdrop: false,
      panelClass: 'custom-position-dialog',
      autoFocus: false
    });

    this.dialogRef.afterClosed().subscribe(() => {
      this.dialogRef = null;
    });
  }



  applyCustomTimeRange(): void {
    this.eventDisplayService.minTime = this.customStartTime;
    this.eventDisplayService.maxTime = this.customEndTime;

    this.eventDisplayService.animationSpeed = this.animationSpeed;

    this.dialogRef?.close();
  }



}
