// event-display-source.component.ts
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { UserConfigService } from "../user-config.service";
import { ReactiveFormsModule } from '@angular/forms';
import {RouterLink} from '@angular/router';
import {ConfigProperty} from "../utils/config-property";

@Component({
  selector: 'app-input-config',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './input-config.component.html',
  styleUrl: './input-config.component.scss'
})
export class InputConfigComponent implements OnInit {

  selectedGeometry = new FormControl('');
  selectedEventSource = new FormControl('');
  onlyCentralDetector: FormControl<boolean | null> = new FormControl(true);

  constructor(private configService: UserConfigService) {
  }


  bindConfigToControl<Type>(control: FormControl<Type | null>, config: ConfigProperty<Type> ) {
    control.setValue(config.value, { emitEvent: false })
    control.valueChanges.subscribe(
      value => {
        if(value !== null) {
          config.value=value;
        }
      }
    );
    config.changes$.subscribe(
      value => {
        control.setValue(value, { emitEvent: false })
      }
    );
  }

  ngOnInit(): void {
    //this.selectedGeometry.setValue(this.configService.selectedGeometry.value, { emitEvent: false })
    this.bindConfigToControl(this.selectedGeometry, this.configService.selectedGeometry);
    this.bindConfigToControl(this.selectedEventSource, this.configService.eventSource);
    this.bindConfigToControl(this.onlyCentralDetector, this.configService.onlyCentralDetector);
  }
}
