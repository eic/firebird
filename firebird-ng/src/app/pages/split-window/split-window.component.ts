import {Component, OnInit, ChangeDetectionStrategy, AfterViewInit, ElementRef, Renderer2} from '@angular/core'
// import { AComponent } from '../../ui/components/AComponent'
// import { SplitAreaSize, SplitGutterInteractionEvent } from 'angular-split'

// interface IConfig {
//   columns: Array<{
//     visible: boolean
//     size: SplitAreaSize
//     rows: Array<{
//       visible: boolean
//       size: SplitAreaSize
//       type: string
//     }>
//   }>
//   disabled: boolean
// }

// const defaultConfig: IConfig = {
//   columns: [
//     {
//       visible: true,
//       size: 25,
//       rows: [
//         { visible: true, size: 25, type: 'A' },
//         { visible: true, size: 75, type: 'B' },
//       ],
//     },
//     {
//       visible: true,
//       size: 50,
//       rows: [
//         { visible: true, size: 60, type: 'doc' },
//         { visible: true, size: 40, type: 'C' },
//       ],
//     },
//     {
//       visible: true,
//       size: 25,
//       rows: [
//         { visible: true, size: 20, type: 'D' },
//         { visible: true, size: 30, type: 'E' },
//         { visible: true, size: 50, type: 'F' },
//       ],
//     },
//   ],
//   disabled: false,
// }

@Component({
    selector: 'app-split-window',
    imports: [],
    templateUrl: './split-window.component.html',
    styleUrl: './split-window.component.scss'
})
export class SplitWindowComponent implements AfterViewInit {
  private isHandlerDragging = false;

  constructor(private elRef: ElementRef, private renderer: Renderer2) {}

  ngAfterViewInit() {
    const handler = this.elRef.nativeElement.querySelector('.handler');
    const wrapper = handler.closest('.wrapper');
    const boxA = wrapper.querySelector('.box');

    this.renderer.listen(handler, 'mousedown', (e: MouseEvent) => {
      // Если событие mousedown произошло на элементе .handler, флаг переключается на true
      this.isHandlerDragging = true;
    });

    this.renderer.listen(document, 'mousemove', (e: MouseEvent) => {
      if (!this.isHandlerDragging) {
        return;
      }


      const containerOffsetLeft = wrapper.offsetLeft;


      const pointerRelativeXpos = e.clientX - containerOffsetLeft;


      const boxAminWidth = 60;


      boxA.style.width = `${Math.max(boxAminWidth, pointerRelativeXpos - 8)}px`;
      boxA.style.flexGrow = '0';
    });

    this.renderer.listen(document, 'mouseup', () => {
      this.isHandlerDragging = false;
    });
  }
}
