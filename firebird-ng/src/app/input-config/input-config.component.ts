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

  selectedGeometry: FormControl<string | null>;

  constructor(private configService: UserConfigService) {
    this.selectedGeometry = new FormControl();
    // this.selectedGeometry.valueChanges.subscribe(
    //   value => this.configService.selectedGeometry.value=value??""
    // );
    // this.configService.selectedGeometry.changes$.subscribe(
    //   value => this.selectedGeometry.setValue(value, { emitEvent: false })
    // );
    // this.geoForm = this.fb.group(this.stateFromConfig());
    //
    // this.geoForm.valueChanges.subscribe(value => {
    //   this.geometryService.saveGeoConfig(value);
    //   console.log(value);
    // });
  }

  //geoForm: FormGroup;

  //
  // constructor(private fb: FormBuilder, private configService: UserConfigService) {
  //   this.geoForm = this.fb.group(this.stateFromConfig());
  //
  //   this.geoForm.valueChanges.subscribe(value => {
  //     this.geometryService.saveGeoConfig(value);
  //     console.log(value);
  //   });
  // }
  //
  // stateFromConfig(): any {
  //   return {
  //     selectedGeometry: this.configService.selectedGeometry,
  //     geoOptEnabled: [false],
  //     selectedEvent: ['Central detector'],
  //     geoPostEnabled: [false]
  //   }
  // }
  //

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
  //   const savedSettings = this.geometryService.getState();
  //   if (savedSettings) {
  //     this.geoForm.setValue(savedSettings);
  //   }
  //
  //   this.geometryService.state$.subscribe(state => {
  //     this.geoForm.setValue(state, { emitEvent: false });
  //   });
  }

}
