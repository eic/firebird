import {
  Component,
  computed,
  Signal,
  ViewChild,
  TemplateRef,
  ElementRef,
  ChangeDetectionStrategy
} from '@angular/core';
import { MatSliderModule } from '@angular/material/slider';
import {DecimalPipe} from '@angular/common';
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
  imports: [MatSliderModule, MatInputModule, DecimalPipe, MatButton, FormsModule, MatIcon, MatIconButton, MatTooltip, MatDialogClose],
  templateUrl: './event-time-control.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./event-time-control.component.scss']
})
export class EventTimeControlComponent {

  @ViewChild('openBtn', { read: ElementRef })
  openBtn!: ElementRef;

  @ViewChild('dialogTemplate')
  dialogTemplate!: TemplateRef<any>;

  dialogRef: MatDialogRef<any> | null = null;


  // Dialog form fields. Read and written only inside the dialog template
  // (the dialog's own view), and refreshed from the service on every open:
  // an event load changes the range after this component was created.
  customStartTime = 0;
  customEndTime = 0;
  animationSpeed = 1.0;

  constructor(public eventDisplayService: EventDisplayService,
              private dialog: MatDialog)
  {

  }

  public shownTime: Signal<number> = computed(()=>{
    const edTime = this.eventDisplayService.eventTime();
    if(edTime === null || edTime === undefined) {
      return this.eventDisplayService.minTime();
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

    this.customStartTime = this.eventDisplayService.minTime();
    this.customEndTime = this.eventDisplayService.maxTime();
    this.animationSpeed = this.eventDisplayService.animationSpeed();

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

  /**
   * Applies the dialog's range and step. They go to service signals: the
   * slider and the range label live in this component's own view, which an
   * event inside the dialog does not mark for check (the dialog renders the
   * template elsewhere), but a signal read there does.
   */
  applyCustomTimeRange(): void {
    this.eventDisplayService.setTimeRange(this.customStartTime, this.customEndTime);
    this.eventDisplayService.setAnimationSpeed(this.animationSpeed);
    this.dialogRef?.close();
  }
}
