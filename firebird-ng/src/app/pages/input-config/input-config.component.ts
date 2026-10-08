import { Component, OnInit, ChangeDetectionStrategy, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';
import { MatCard, MatCardContent, MatCardTitle } from '@angular/material/card';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatFormField } from '@angular/material/form-field';
import { MatInput, MatLabel } from '@angular/material/input';
import { MatAccordion, MatExpansionPanel, MatExpansionPanelTitle, MatExpansionPanelHeader } from '@angular/material/expansion';
import { MatButton } from "@angular/material/button";
import { MatSelect } from '@angular/material/select';
import { MatOption } from '@angular/material/autocomplete';
import { ConfigProperty, ConfigSchema, ConfigService, ServerConfigService } from '@dexvis/app-features';
import { ServerConfig } from '../../services/server-config';
import { UrlService } from '../../services/url.service';
import {
  BACKEND_URL_CONFIG,
  BACKEND_USE_API_CONFIG,
  GEOMETRY_CUT_LIST_CONFIG,
  GEOMETRY_FAST_MATERIAL_CONFIG,
  GEOMETRY_ROOT_FILTER_CONFIG,
  GEOMETRY_THEME_CONFIG,
  USE_CONTROLLER_CONFIG,
} from '../../firebird/config-keys';
import { DataSelectorComponent } from '../../components/data-selector/data-selector.component';
import { FirebirdShellComponent } from '../../components/firebird-shell/firebird-shell.component';

/**
 * The configuration page: what to load (the data selector, shared with the
 * display's toolbar panel), the geometry pipeline options, controls and the
 * backend connection. Every control is bound to a config key, so the same
 * values are reachable from deep links, config.jsonc and yaml.
 */
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
    DataSelectorComponent,
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelTitle,
    MatExpansionPanelHeader,
    FirebirdShellComponent,
    MatButton,
    MatSelect,
    MatOption,
    NgIf,
  ],
  templateUrl: './input-config.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./input-config.component.scss']
})
export class InputConfigComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  /** The backend the app talks to right now (shown under Backend Details). */
  protected readonly urlService = inject(UrlService);

  serverUseApi = new FormControl<boolean>(false);
  serverApiUrl = new FormControl<string>('http://localhost:5454');

  geometryThemeName = new FormControl<string>('cool2');
  geometryCutListName = new FormControl<string>('off');
  geometryRootFilterName = new FormControl<string>('default');
  geometryFastAndUgly = new FormControl<boolean>(false);
  useController = new FormControl<boolean>(false);

  /**
   * Server config for the template, bound through the service SIGNAL:
   * ServerConfigService replaces its config object when the async load
   * completes, so a by-reference snapshot taken in ngOnInit goes stale.
   */
  get firebirdConfig(): ServerConfig {
    return this.firebirdConfigService.configSignal();
  }

  constructor(
    private userConfigService: ConfigService,
    private firebirdConfigService: ServerConfigService<ServerConfig>
  ) {}

  /** The selector wrote the config keys; the display page loads from them on init. */
  onDataApplied(): void {
    void this.router.navigate(['/display']);
  }

  /**
   * Two-way binds a form control to a config key. The key is declared from
   * the same schema its consumer declares (UrlService, GameControllerService,
   * GeometryService), so the control writes exactly what the app reads.
   * Both subscriptions end with the page.
   */
  private bind<T>(control: FormControl<T | null>, schema: ConfigSchema<T>): ConfigProperty<T> {
    const property = this.userConfigService.declare(schema);
    control.setValue(property.value, { emitEvent: false });
    property.changes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => {
      control.setValue(value, { emitEvent: false });
    });
    control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => {
      if (value !== null) {
        property.value = value;
      }
    });
    return property;
  }

  ngOnInit(): void {
    this.bind(this.serverUseApi, BACKEND_USE_API_CONFIG);
    this.bind(this.serverApiUrl, BACKEND_URL_CONFIG);
    this.bind(this.geometryThemeName, GEOMETRY_THEME_CONFIG);
    this.bind(this.geometryCutListName, GEOMETRY_CUT_LIST_CONFIG);
    this.bind(this.geometryRootFilterName, GEOMETRY_ROOT_FILTER_CONFIG);
    this.bind(this.geometryFastAndUgly, GEOMETRY_FAST_MATERIAL_CONFIG);
    this.bind(this.useController, USE_CONTROLLER_CONFIG);
  }

  /** Drops the saved pipeline choices: each falls back to the server value or its default. */
  resetGeometryToDefaults() {
    for (const schema of [GEOMETRY_THEME_CONFIG, GEOMETRY_CUT_LIST_CONFIG, GEOMETRY_ROOT_FILTER_CONFIG]) {
      this.userConfigService.declare<string>(schema).setDefault();
    }
  }
}
