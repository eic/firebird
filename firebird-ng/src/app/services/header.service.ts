// firebird-ng/src/app/services/header.service.ts

import { Injectable, TemplateRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * A service that holds optional "page-specific" header controls.
 * Each page can set a template or data for the global header to display in the middle.
 */
@Injectable({
  providedIn: 'root',
})
export class HeaderService {
  private _middleControls = new BehaviorSubject<TemplateRef<any> | null>(null);
  /** Observable that the header will subscribe to. */
  middleControls$ = this._middleControls.asObservable();

  /** Called by a page to display custom controls. */
  setMiddleControls(template: TemplateRef<any> | null): void {
    this._middleControls.next(template);
  }
}
