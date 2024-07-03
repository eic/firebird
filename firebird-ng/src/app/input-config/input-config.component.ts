// event-display-source.component.ts
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { UserConfigService } from "../user-config.service";
import { ReactiveFormsModule } from '@angular/forms';
import {RouterLink} from '@angular/router';
import {ConfigProperty} from "../utils/config-property";
import {MatCard, MatCardContent, MatCardTitle} from "@angular/material/card";
import {MatSlideToggle} from "@angular/material/slide-toggle";
import {MatFormField} from "@angular/material/form-field";
import {MatInput, MatLabel} from "@angular/material/input";
import {map, Observable, startWith} from "rxjs";
import {MatAutocomplete, MatAutocompleteTrigger, MatOption} from "@angular/material/autocomplete";
import {AsyncPipe, NgForOf} from "@angular/common";
import {MatTooltip} from "@angular/material/tooltip";

export interface User {
  name: string;
  url: string;
}

@Component({
  selector: 'app-input-config',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MatCard, MatCardContent, MatCardTitle, MatSlideToggle, MatFormField, MatInput, MatLabel, MatAutocompleteTrigger, MatAutocomplete, MatOption, AsyncPipe, MatTooltip, NgForOf],
  templateUrl: './input-config.component.html',
  styleUrl: './input-config.component.scss'
})
export class InputConfigComponent implements OnInit {

  geometrySelectValue = new FormControl('');
  geometryUrl = new FormControl('');
  selectedEventSource = new FormControl('');
  onlyCentralDetector: FormControl<boolean | null> = new FormControl(true);
  serverUseApi: FormControl<boolean | null> = new FormControl(false);
  serverApiHost = new FormControl('localhost');
  serverApiPort: FormControl<number | null> = new FormControl(5454);
  filteredOptions: Observable<User[]>  = new Observable<User[]>();


  myControl = new FormControl<string | User>('');
  options: User[] = [
    {url: "builtin://epic-central-optimized", name: "EIC ePIC Central Detector optimized"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_bhcal.root", name: "epic_bhcal.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_calorimeters.root", name: "epic_calorimeters.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake.root", name: "epic_craterlake.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_10x100.root", name: "epic_craterlake_10x100.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_10x275.root", name: "epic_craterlake_10x275.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_18x110_Au.root", name: "epic_craterlake_18x110_Au.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_18x275.root", name: "epic_craterlake_18x275.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_5x41.root", name: "epic_craterlake_5x41.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_material_map.root", name: "epic_craterlake_material_map.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_no_bhcal.root", name: "epic_craterlake_no_bhcal.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_tracking_only.root", name: "epic_craterlake_tracking_only.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_dirc_only.root", name: "epic_dirc_only.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_drich_only.root", name: "epic_drich_only.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_forward_detectors.root", name: "epic_forward_detectors.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_forward_detectors_with_inserts.root", name: "epic_forward_detectors_with_inserts.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_full.root", name: "epic_full.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_imaging_only.root", name: "epic_imaging_only.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_inner_detector.root", name: "epic_inner_detector.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_ip6.root", name: "epic_ip6.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_ip6_extended.root", name: "epic_ip6_extended.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_lfhcal_only.root", name: "epic_lfhcal_only.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_lfhcal_with_insert.root", name: "epic_lfhcal_with_insert.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_mrich_only.root", name: "epic_mrich_only.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_pfrich_only.root", name: "epic_pfrich_only.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_pid_only.root", name: "epic_pid_only.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_tof_endcap_only.root", name: "epic_tof_endcap_only.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_tof_only.root", name: "epic_tof_only.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_vertex_only.root", name: "epic_vertex_only.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_zdc_lyso_sipm.root", name: "epic_zdc_lyso_sipm.root"},
    {url: "https://eic.github.io/epic/artifacts/tgeo/epic_zdc_sipm_on_tile_only.root", name: "epic_zdc_sipm_on_tile_only.root"}
];






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
    this.bindConfigToControl(this.geometryUrl, this.configService.selectedGeometry);
    this.bindConfigToControl(this.selectedEventSource, this.configService.eventSource);
    this.bindConfigToControl(this.onlyCentralDetector, this.configService.onlyCentralDetector);
    this.bindConfigToControl(this.serverUseApi, this.configService.localServerUseApi);
    this.bindConfigToControl(this.serverApiHost, this.configService.localServerHost);
    this.bindConfigToControl(this.serverApiPort, this.configService.localServerPort);

    // noinspection JSDeprecatedSymbols
    this.filteredOptions = this.myControl.valueChanges.pipe(
      startWith(''),
      map(value => {
        // Get string name
        const name = typeof value === 'string' ? value : value?.name;
        return name ? this._filter(name as string) : this.options.slice();
      })
    );
  }

  displayFn(user: User): string {
    return user && user.name ? user.name : '';
  }

  private _filter(name: string): User[] {
    const filterValue = name.toLowerCase();
    return this.options.filter(option => option.name.toLowerCase().includes(filterValue));
  }
}
