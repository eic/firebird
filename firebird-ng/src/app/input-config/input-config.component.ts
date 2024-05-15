// event-display-source.component.ts
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { GeometryService } from '../geometry.service';
import { ReactiveFormsModule } from '@angular/forms';
import {RouterLink} from '@angular/router';

@Component({
  selector: 'app-input-config',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './input-config.component.html',
  styleUrl: './input-config.component.scss'
})
export class InputConfigComponent implements OnInit {

  geoForm: FormGroup;

  constructor(private fb: FormBuilder, private geometryService: GeometryService) {
    this.geoForm = this.fb.group({
      selectedGeometry: ['eic geometry'],
      geoOptEnabled: [false],
      selectedGeoCutoff: ['Central detector'],
      geoPostEnabled: [false]
    });

    this.geoForm.valueChanges.subscribe(value => {
      //this.geometryService.save(value);
      console.log(value);
    });
  }

  ngOnInit(): void {
    // const savedSettings = this.geometryService.load();
    // if (savedSettings) {
    //   this.geoForm.setValue(savedSettings);
    // }
  }

}
