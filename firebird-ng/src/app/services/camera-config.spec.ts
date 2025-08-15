import { TestBed } from '@angular/core/testing';

import { CameraConfig } from './camera-config';

describe('CameraConfig', () => {
  let service: CameraConfig;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CameraConfig);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
