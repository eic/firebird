import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormControl } from '@angular/forms';
import { UserConfigService } from '../../services/user-config.service';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ConfigProperty } from '../../utils/config-property';
import { MatCard, MatCardContent, MatCardTitle } from '@angular/material/card';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatFormField } from '@angular/material/form-field';
import { MatInput, MatLabel } from '@angular/material/input';
import { MatAutocomplete, MatAutocompleteTrigger, MatOption } from '@angular/material/autocomplete';
import { AsyncPipe, NgForOf } from '@angular/common';
import { MatTooltip } from '@angular/material/tooltip';
import { ResourceSelectComponent } from '../../components/resource-select/resource-select.component';
import { defaultFirebirdConfig, ServerConfig, ServerConfigService } from '../../services/server-config.service';
import { MatAccordion, MatExpansionPanel, MatExpansionPanelTitle, MatExpansionPanelHeader } from '@angular/material/expansion';
import {ShellComponent} from "../../components/shell/shell.component";

@Component({
  selector: 'app-input-config',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCard,
    MatCardContent,
    MatCardTitle,
    MatSlideToggle,
    MatFormField,
    MatInput,
    MatLabel,
    MatAutocomplete,
    MatAutocompleteTrigger,
    MatOption,
    AsyncPipe,
    MatTooltip,
    NgForOf,
    ResourceSelectComponent,
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelTitle,
    MatExpansionPanelHeader,
    RouterOutlet,
    ShellComponent,
  ],
  templateUrl: './input-config.component.html',
  styleUrls: ['./input-config.component.scss']
})
export class InputConfigComponent implements OnInit, AfterViewInit {

  @ViewChild('geometrySelect')
  geometrySelect!: ResourceSelectComponent;

  @ViewChild('edm4eicSelect')
  edm4eicSelect!: ResourceSelectComponent;

  @ViewChild('dexJsonSelect')
  dexJsonSelect!: ResourceSelectComponent;

  selectedEventSource = new FormControl('');
  onlyCentralDetector: FormControl<boolean | null> = new FormControl(true);
  serverUseApi: FormControl<boolean | null> = new FormControl(false);
  serverApiUrl = new FormControl('http://localhost:5454');
  serverApiPort: FormControl<number | null> = new FormControl(5454);
  firebirdConfig: ServerConfig = defaultFirebirdConfig;

  public geometryOptions: string[] = [
    "builtin://epic-central-optimized",
    "https://eic.github.io/epic/artifacts/tgeo/epic_bhcal.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_calorimeters.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_10x100.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_10x275.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_18x110_Au.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_18x275.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_5x41.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_material_map.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_no_bhcal.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_tracking_only.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_dirc_only.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_drich_only.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_forward_detectors.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_forward_detectors_with_inserts.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_full.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_imaging_only.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_inner_detector.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_ip6.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_ip6_extended.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_lfhcal_only.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_lfhcal_with_insert.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_mrich_only.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_pfrich_only.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_pid_only.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_tof_endcap_only.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_tof_only.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_vertex_only.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_zdc_lyso_sipm.root",
    "https://eic.github.io/epic/artifacts/tgeo/epic_zdc_sipm_on_tile_only.root"
  ];

  public trajectoryOptions: string[] = [
    "https://firebird-eic.org/dirc_event.json.zip",
    "https://firebird-eic.org/py8_dis-cc_10x100_minq2-1000_minp-300mev_vtxcut-5m_nevt-5.evt.zip",
    "https://firebird-eic.org/py8_dis-cc_18x275_minq2-1000_minp-300mev_vtxcut-5m_nevt-5.evt.zip",
    "https://firebird-eic.org/py8_dis-cc_18x275_minq2-100_minp-300mev_vtxcut-5m_nevt-5.evt.zip",
    "https://firebird-eic.org/py8_dis-cc_5x41_minq2-100_minp-300mev_vtxcut-5m_nevt-5.evt.zip",
    "https://firebird-eic.org/py8_dis-cc_all_minq2-100_minp-300mev_vtxcut-5m_nevt-5.evt.zip",
    "https://firebird-eic.org/py8_dis-nc_10x100_minq2-1000_minp-300mev_vtxcut-5m_nevt-5.evt.zip",
    "https://firebird-eic.org/py8_dis-nc_10x100_minq2-100_minp-300mev_vtxcut-5m_nevt-5.evt.zip",
    "https://firebird-eic.org/py8_dis-nc_10x100_minq2-1_minp-300mev_vtxcut-5m_nevt-5.evt.zip",
    "https://firebird-eic.org/py8_dis-nc_18x275_minq2-1000_minp-300mev_vtxcut-5m_nevt-5.evt.zip",
    "https://firebird-eic.org/py8_dis-nc_18x275_minq2-100_minp-300mev_vtxcut-5m_nevt-5.evt.zip",
    "https://firebird-eic.org/py8_dis-nc_18x275_minq2-1_minp-300mev_vtxcut-5m_nevt-5.evt.zip",
    "https://firebird-eic.org/py8_dis-nc_5x41_minq2-100_minp-300mev_vtxcut-5m_nevt-5.evt.zip",
    "https://firebird-eic.org/py8_dis-nc_all_minq2-1_minp-300mev_vtxcut-5m_nevt-5.evt.zip"
  ];

  public edm4eicOptions: string[] = [
    ""
  ];

  constructor(
    private userConfigService: UserConfigService,
    private firebirdConfigService: ServerConfigService
  ) { }

  bindConfigToControl<Type>(control: FormControl<Type | null>, config: ConfigProperty<Type>) {
    control.setValue(config.value, { emitEvent: false });
    control.valueChanges.subscribe(value => {
      if (value !== null) {
        config.value = value;
      }
    });
    config.changes$.subscribe(value => {
      control.setValue(value, { emitEvent: false });
    });
  }

  ngAfterViewInit() {
    // Now that the resource selects are available
    this.bindConfigToControl(this.geometrySelect.value, this.userConfigService.selectedGeometry);
    this.bindConfigToControl(this.edm4eicSelect.value, this.userConfigService.edm4eicEventSource);
    this.bindConfigToControl(this.dexJsonSelect.value, this.userConfigService.dexJsonEventSource);
  }

  ngOnInit(): void {
    this.bindConfigToControl(this.onlyCentralDetector, this.userConfigService.onlyCentralDetector);
    this.bindConfigToControl(this.serverUseApi, this.userConfigService.localServerUseApi);
    this.bindConfigToControl(this.serverApiUrl, this.userConfigService.localServerUrl);

    this.firebirdConfig = this.firebirdConfigService.config;
  }
}
