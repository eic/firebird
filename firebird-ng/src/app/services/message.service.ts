import { Injectable, TemplateRef } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BehaviorSubject } from 'rxjs';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

export type MessageType = 'error' | 'info' | 'warning';
export type Message = {
  type: MessageType;
  content: string;
  timestamp: Date;
};

@Injectable({ providedIn: 'root' })
export class MessageService {
  private errorQueue: Message[] = [];
  private infoQueue: Message[] = [];
  private allMessages = new BehaviorSubject<Message[]>([]);
  private viewport?: CdkVirtualScrollViewport;

  constructor(private snackBar: MatSnackBar) {}

  registerViewport(viewport: CdkVirtualScrollViewport) {
    this.viewport = viewport;
  }

  addMessage(type: MessageType, content: string) {
    const message: Message = {
      type,
      content,
      timestamp: new Date()
    };

    // Add to appropriate queue
    if (type === 'error') {
      this.errorQueue.push(message);
      this.processErrorQueue();
    } else {
      this.infoQueue.push(message);
      this.processInfoQueue();
    }

    // Add to all messages log
    this.allMessages.next([...this.allMessages.value, message]);

    // Scroll to bottom if viewport exists
    setTimeout(() => this.viewport?.scrollToIndex(this.allMessages.value.length));
  }

  private processErrorQueue() {
    if (this.errorQueue.length > 0) {
      const message = this.errorQueue.shift()!;
      this.showSnackBar(message);
    }
  }

  private processInfoQueue() {
    if (this.infoQueue.length > 0 && this.errorQueue.length === 0) {
      const message = this.infoQueue.shift()!;
      this.showSnackBar(message);
    }
  }

  private showSnackBar(message: Message) {
    this.snackBar.open(message.content, 'Dismiss', {
      duration: message.type === 'error' ? 5000 : 3000,
      panelClass: [`message-${message.type}`],
      verticalPosition: 'top',
      horizontalPosition: 'right'
    }).afterDismissed().subscribe(() => {
      if (message.type === 'error') {
        this.processErrorQueue();
      } else {
        this.processInfoQueue();
      }
    });
  }

  getMessageStream() {
    return this.allMessages.asObservable();
  }

  clearMessages() {
    this.allMessages.next([]);
  }
}
