import { Directive, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { PainterConfig } from '../painter-config.interface';

@Directive()
export abstract class ConfiguratorComponent<T extends PainterConfig> implements OnInit {
  @Input() config!: T;
  @Output() configChanged = new EventEmitter<T>();

  protected getPropertyMetadata(propertyName: keyof T): any {
    return Reflect.getMetadata('configProperty', this.config, propertyName as string);
  }

  protected shouldShowProperty(propertyName: keyof T): boolean {
    const metadata = this.getPropertyMetadata(propertyName);
    return !metadata?.showWhen || metadata.showWhen(this.config);
  }

  protected notifyChanges(): void {
    this.configChanged.emit(this.config);
  }

  ngOnInit() {}
}
