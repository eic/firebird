import { TestBed } from '@angular/core/testing';

import { EventDisplayService } from './event-display.service';
import {HttpClientTestingModule, provideHttpClientTesting} from "@angular/common/http/testing";
import {importProvidersFrom} from "@angular/core";
import {HttpClient, HttpClientModule, provideHttpClient, withInterceptorsFromDi} from "@angular/common/http";

describe('EventDisplayService', () => {
  let service: EventDisplayService;

  beforeEach(() => {
    TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptorsFromDi()),
          provideHttpClientTesting(),
        ]
    });
    service = TestBed.inject(EventDisplayService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
