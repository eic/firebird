import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventTimeControlComponent } from './event-time-control.component';
import {provideHttpClientTesting} from "@angular/common/http/testing";
import {HttpClient, HttpClientModule} from "@angular/common/http";

describe('EventTimeControlComponent', () => {
  let component: EventTimeControlComponent;
  let fixture: ComponentFixture<EventTimeControlComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventTimeControlComponent,  HttpClientModule],
      providers: [provideHttpClientTesting()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventTimeControlComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
