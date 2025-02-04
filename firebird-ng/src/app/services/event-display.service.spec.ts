import { TestBed } from '@angular/core/testing';

import { EventDisplayService } from './event-display.service';

describe('EventDisplayService', () => {
  let service: EventDisplayService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EventDisplayService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
