import { TestBed } from '@angular/core/testing';

import { GeometryService } from './geometry.service';
import {HttpClientModule} from "@angular/common/http";

describe('GeometryService', () => {
  let service: GeometryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientModule], // Add this line
    });
    service = TestBed.inject(GeometryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
