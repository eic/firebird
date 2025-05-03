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
import { ResourceSelectComponent } from '../../components/resource-select/resource-select.component';
import { defaultFirebirdConfig, ServerConfig, ServerConfigService } from '../../services/server-config.service';
import { MatAccordion, MatExpansionPanel, MatExpansionPanelTitle, MatExpansionPanelHeader } from '@angular/material/expansion';
import {ShellComponent} from "../../components/shell/shell.component";
import {MatButton} from "@angular/material/button";

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
    ResourceSelectComponent,
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelTitle,
    MatExpansionPanelHeader,
    ShellComponent,
    MatButton,
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

  @ViewChild('premadeGeometry') premadeGeometry!: ResourceSelectComponent;

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

    "asset://data/dirc_optical.v0.4.firebird.zip",
    "asset://data/py8_dis-cc_5x41_minq2-1_minp-150mev_vtxcut-5m_nevt-5.v0.4.firebird.zip",
    "asset://data/py8_dis-cc_5x41_minq2-100_minp-150mev_vtxcut-5m_nevt-5.v0.4.firebird.zip",
    "asset://data/py8_dis-cc_10x100_minq2-1_minp-150mev_vtxcut-5m_nevt-5.v0.4.firebird.zip",
    "asset://data/py8_dis-cc_10x100_minq2-100_minp-150mev_vtxcut-5m_nevt-5.v0.4.firebird.zip",
    "asset://data/py8_dis-cc_10x100_minq2-1000_minp-150mev_vtxcut-5m_nevt-5.v0.4.firebird.zip",
    "asset://data/py8_dis-cc_18x275_minq2-1_minp-150mev_vtxcut-5m_nevt-5.v0.4.firebird.zip",
    "asset://data/py8_dis-cc_18x275_minq2-100_minp-150mev_vtxcut-5m_nevt-5.v0.4.firebird.zip",
    "asset://data/py8_dis-cc_18x275_minq2-1000_minp-150mev_vtxcut-5m_nevt-5.v0.4.firebird.zip",
    "asset://data/rec_dis_18x275_fdex-v0.4.edm4eic.v0.4.firebird.zip",
  ];


  public edm4eicOptions: string[] = [
    ""
  ];


  quickLinks: { [title: string]: { geometry: string; dexjson: string; edm4eic: string } } = {
    'Full ePIC detector geometry (no events)': {
      geometry: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake.root",
      dexjson: "",
      edm4eic: ""
    },
    'DIS CC in ePIC Beam=5x41 minQ2=1': {
      geometry: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake.root",
      dexjson: "asset://data/py8_dis-cc_5x41_minq2-1_minp-150mev_vtxcut-5m_nevt-5.v0.4.firebird.zip",
      edm4eic: ""
    },
    'DIS CC in ePIC Beam=10x100 minQ2=1': {
      geometry: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake.root",
      dexjson: "asset://data/py8_dis-cc_10x100_minq2-1_minp-150mev_vtxcut-5m_nevt-5.v0.4.firebird.zip",
      edm4eic: ""
    },
    'DIS CC in ePIC Beam=18x275 minQ2=1': {
      geometry: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake.root",
      dexjson: "asset://data/py8_dis-cc_18x275_minq2-1_minp-150mev_vtxcut-5m_nevt-5.v0.4.firebird.zip",
      edm4eic: ""
    },
    'Tracking reconstruction ePIC Beam=18x275': {
      geometry: "https://eic.github.io/epic/artifacts/tgeo/epic_craterlake_tracking_only.root",
      dexjson: "asset://data/rec_dis_18x275_fdex-v0.4.edm4eic.v0.4.firebird.zip",
      edm4eic: ""
    },
    'DIRC optical photons': {
      geometry: "https://eic.github.io/epic/artifacts/tgeo/epic_dirc_only.root",
      dexjson: "asset://data/dirc_optical.v0.4.firebird.zip",
      edm4eic: ""
    }
  };

  public get quickLinkTitles() {
    return Object.keys(this.quickLinks);
  }

  constructor(
    private userConfigService: UserConfigService,
    private firebirdConfigService: ServerConfigService
  ) {
  }

  bindConfigToControl<Type>(control: FormControl<Type | null>, config: ConfigProperty<Type>) {
    control.setValue(config.value, { emitEvent: false });

    config.changes$.subscribe(value => {
      control.setValue(value, { emitEvent: false });
    });

    control.valueChanges.subscribe(value => {
      if (value !== null) {
        config.value = value;
      }
    });
  }


  ngAfterViewInit() {
    console.log('[ConfigPage] ngAfterViewInit');
    // Now that the resource selects are available

    this.bindConfigToControl(this.geometrySelect.value, this.userConfigService.selectedGeometry);
    this.bindConfigToControl(this.edm4eicSelect.value, this.userConfigService.edm4eicEventSource);
    this.bindConfigToControl(this.dexJsonSelect.value, this.userConfigService.dexJsonEventSource);


    this.loadInitialConfig();

  }

  selectedPreset = 'Full ePIC detector geometry (no events)';

  ngOnInit(): void {
    this.bindConfigToControl(this.onlyCentralDetector, this.userConfigService.onlyCentralDetector);
    this.bindConfigToControl(this.serverUseApi, this.userConfigService.localServerUseApi);
    this.bindConfigToControl(this.serverApiUrl, this.userConfigService.localServerUrl);

    this.firebirdConfig = this.firebirdConfigService.config;
    setTimeout(() => {
      this.geometrySelect?.value.setValue(this.userConfigService.selectedGeometry.value);
      this.edm4eicSelect?.value.setValue(this.userConfigService.edm4eicEventSource.value);
      this.dexJsonSelect?.value.setValue(this.userConfigService.dexJsonEventSource.value);
    });
  }

  onPresetChange(newValue: string) {
  this.selectedPreset = newValue;
  const config = this.quickLinks[newValue];

  if (config) {
    this.userConfigService.selectedGeometry.value = config.geometry;
    this.userConfigService.dexJsonEventSource.value = config.dexjson;
    this.userConfigService.edm4eicEventSource.value = config.edm4eic;

    setTimeout(() => {
      if (this.geometrySelect) {
        this.geometrySelect.value.setValue(config.geometry);
      }
      if (this.dexJsonSelect) {
        this.dexJsonSelect.value.setValue(config.dexjson);
      }
      if (this.edm4eicSelect) {
        this.edm4eicSelect.value.setValue(config.edm4eic);
      }
    });
  }
}

  private loadInitialConfig() {
    const savedDex = this.userConfigService.dexJsonEventSource.value;
    const savedGeom = this.userConfigService.selectedGeometry.value;

    if (savedDex || savedGeom) {
      return;
    }

    const preset = this.quickLinks[this.selectedPreset];
    if (preset) {
      this.onPresetChange(this.selectedPreset);
    }
  }

}
