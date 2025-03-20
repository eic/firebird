import { Component, ViewChild } from '@angular/core';
import { MessageService, Message } from '../../services/message.service';
import {CdkFixedSizeVirtualScroll, CdkVirtualForOf, CdkVirtualScrollViewport} from '@angular/cdk/scrolling';
import {AsyncPipe, DatePipe, UpperCasePipe} from "@angular/common";

@Component({
  selector: 'app-message-log',
  templateUrl: './message-log.component.html',
  styleUrls: ['./message-log.component.scss'],
  standalone: true,
  imports: [CdkVirtualScrollViewport, CdkFixedSizeVirtualScroll, CdkVirtualForOf, AsyncPipe, UpperCasePipe, DatePipe]
})
export class MessageLogComponent {
  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;
  messages = this.messageService.getMessageStream();
  itemSize = 56; // Height of each message item

  constructor(private messageService: MessageService) {}

  ngAfterViewInit() {
    this.messageService.registerViewport(this.viewport);
  }

  trackByFn(index: number, message: Message) {
    return message.timestamp.getTime();
  }
}
