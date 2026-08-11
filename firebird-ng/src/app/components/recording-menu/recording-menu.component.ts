import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  ViewChild,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { MatDialog, MatDialogClose, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import JSZip from 'jszip';

import { EventDisplayService } from '../../services/event-display.service';
import { ThreeService } from '../../services/three.service';
import { RenderView } from '../../services/render-view';

/**
 * Toolbar recording menu — the one recording surface for every display page.
 *
 * Two capture paths:
 * - LIVE (webm): MediaRecorder on the shared canvas. Records exactly what is
 *   on screen — on a multi-view page that is all views together. Note that
 *   the recorder receives frames only when the canvas repaints: under the
 *   default render-on-demand mode an idle display holds the last frame,
 *   which is the correct recording of an unchanging screen.
 * - FRAME CAPTURE (PNG sequence): offline frame-by-frame render via
 *   EventDisplayService.captureFramesOffline. Records a chosen VIEW at a
 *   chosen resolution — one view full-frame (its camera, cut and
 *   tracks-on-top applied), or all views as a grid composite — stepping
 *   event time per frame, independent of screen size and speed.
 */
@Component({
  selector: 'app-recording-menu',
  standalone: true,
  imports: [FormsModule, MatIcon, MatIconButton, MatButton, MatTooltip, MatDialogClose],
  templateUrl: './recording-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./recording-menu.component.scss'],
})
export class RecordingMenuComponent {
  @ViewChild('openBtn', { read: ElementRef }) openBtn!: ElementRef;
  @ViewChild('dialogTemplate') dialogTemplate!: TemplateRef<unknown>;
  dialogRef: MatDialogRef<unknown> | null = null;

  // ── Live webm recording ──
  liveRecording = signal(false);
  private mediaRecorder?: MediaRecorder;
  private recordedBlobs: Blob[] = [];

  // ── Offline frame capture ──
  /** 'main', a view name, or 'all' for the grid composite. */
  captureSource = 'main';
  captureWidth = 3840;
  captureHeight = 2160;
  includeCollision = true;
  offlineRecording = signal(false);
  offlineProgress = signal('');
  private offlineAbort: AbortController | null = null;
  private capturedFrames: Blob[] = [];

  constructor(
    private eventDisplay: EventDisplayService,
    private three: ThreeService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  /** Capture sources: the main view, each added view by name, all together. */
  get sourceOptions(): Array<{ value: string; label: string }> {
    const options = [{ value: 'main', label: 'Main view' }];
    for (const view of this.three.views) {
      if (view !== this.three.mainView) {
        options.push({ value: view.name, label: `${view.name} view` });
      }
    }
    if (this.three.views.length > 1) {
      options.push({ value: 'all', label: 'All views (grid)' });
    }
    return options;
  }

  get framesReady(): number {
    return this.capturedFrames.length;
  }

  openDialog(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
      return;
    }
    const rect = this.openBtn.nativeElement.getBoundingClientRect();
    const dialogWidth = 340;
    this.dialogRef = this.dialog.open(this.dialogTemplate, {
      position: {
        top: `${rect.bottom + 12}px`,
        left: `${Math.max(rect.right - dialogWidth, 8)}px`,
      },
      hasBackdrop: false,
      panelClass: 'custom-position-dialog',
      autoFocus: false,
    });
    this.dialogRef.afterClosed().subscribe(() => {
      this.dialogRef = null;
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Live webm recording (whole canvas)
  // ────────────────────────────────────────────────────────────────────────

  startLiveRecording(): void {
    if (this.liveRecording()) return;
    const stream = this.three.renderer.domElement.captureStream(60);
    this.recordedBlobs = [];

    const optionsList = [
      { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 200_000_000 },
      { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 200_000_000 },
      { mimeType: 'video/webm', videoBitsPerSecond: 200_000_000 },
    ];

    let recorder: MediaRecorder | null = null;
    for (const options of optionsList) {
      if (MediaRecorder.isTypeSupported(options.mimeType)) {
        try {
          recorder = new MediaRecorder(stream, options);
          break;
        } catch (error) {
          console.warn('MediaRecorder rejected options', options, error);
        }
      }
    }
    if (!recorder) {
      this.snackBar.open('MediaRecorder is not supported by this browser.', 'OK', { duration: 5000 });
      return;
    }

    this.mediaRecorder = recorder;
    recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) {
        this.recordedBlobs.push(event.data);
      }
    };
    recorder.start(100);
    this.liveRecording.set(true);
  }

  stopLiveRecording(): void {
    this.mediaRecorder?.stop();
    this.liveRecording.set(false);
  }

  downloadLiveRecording(): void {
    if (this.recordedBlobs.length === 0) {
      this.snackBar.open('No live recording captured yet.', 'OK', { duration: 4000 });
      return;
    }
    const blob = new Blob(this.recordedBlobs, { type: 'video/webm' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'firebird-recording.webm';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Offline frame capture (view-aware)
  // ────────────────────────────────────────────────────────────────────────

  private resolveViews(): RenderView[] {
    if (this.captureSource === 'all') return [...this.three.views];
    if (this.captureSource === 'main') return [this.three.mainView];
    const view = this.three.views.find(candidate => candidate.name === this.captureSource);
    return view ? [view] : [this.three.mainView];
  }

  async startOfflineRecording(): Promise<void> {
    if (this.offlineRecording()) return;
    this.snackBar.open('Capture may distort video in your browser. Resulting captures will be fine.', 'OK', { duration: 5000 });
    this.offlineRecording.set(true);
    this.offlineProgress.set('Preparing...');
    this.offlineAbort = new AbortController();

    let frames: Blob[] = [];
    try {
      frames = await this.eventDisplay.captureFramesOffline({
        overrideResolution: true,
        width: this.captureWidth,
        height: this.captureHeight,
        eventTimeStep: 0.1,
        includeCollision: this.includeCollision,
        signal: this.offlineAbort.signal,
        views: this.resolveViews(),
        onProgress: (current, total) => {
          this.offlineProgress.set(total > 0 ? `Frame ${current} / ${total}` : `Frame ${current} (collision phase)`);
        },
      });
      if (this.offlineAbort.signal.aborted) {
        this.offlineProgress.set(`Stopped. Captured ${frames.length} frames.`);
      }
    } catch (error) {
      console.error('Offline recording failed:', error);
      this.snackBar.open(`Offline recording failed: ${error}`, 'Dismiss', { duration: 7000 });
      this.offlineRecording.set(false);
      return;
    }

    this.capturedFrames = frames;
    this.offlineRecording.set(false);
    if (frames.length > 0) {
      this.offlineProgress.set(`${frames.length} frames ready. Use "Download frames".`);
    }
  }

  stopOfflineRecording(): void {
    this.offlineAbort?.abort();
  }

  async downloadFrames(): Promise<void> {
    const total = this.capturedFrames.length;
    if (total === 0) {
      this.snackBar.open('No frames captured yet.', 'OK', { duration: 4000 });
      return;
    }

    // Prefer File System Access API (Chromium) — writes each PNG directly,
    // no memory spike. Falls back to chunked ZIPs for Firefox/Safari.
    if ('showDirectoryPicker' in window) {
      try {
        await this.downloadFramesToDirectory(total);
        return;
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') return; // user cancelled picker
        console.warn('Directory picker failed, falling back to chunked ZIPs:', error);
      }
    }
    await this.downloadFramesAsChunkedZips(total);
  }

  /** Write each frame as an individual PNG into a user-chosen folder. */
  private async downloadFramesToDirectory(total: number): Promise<void> {
    this.offlineProgress.set('Choose a folder to save frames...');
    const dirHandle = await (window as unknown as {
      showDirectoryPicker(options: { mode: string }): Promise<{
        getFileHandle(name: string, options: { create: boolean }): Promise<{
          createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
        }>;
      }>;
    }).showDirectoryPicker({ mode: 'readwrite' });

    const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));
    this.snackBar.open(`Saving ${total} frames to folder...`, undefined, { duration: 0 });

    for (let i = 0; i < total; i++) {
      const name = `frame_${String(i).padStart(6, '0')}.png`;
      const fileHandle = await dirHandle.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(this.capturedFrames[i]);
      await writable.close();
      if (i % 10 === 0) {
        this.offlineProgress.set(`Saving frame ${i + 1} / ${total}...`);
        await yieldToUI();
      }
    }

    this.offlineProgress.set(`Done! Saved ${total} frames to folder.`);
    this.snackBar.open(`Saved ${total} frames`, 'OK', { duration: 5000 });
  }

  /**
   * Fallback: split frames into small ZIPs (~200 frames each) so no single
   * ZIP blob exceeds browser ArrayBuffer limits.
   */
  private async downloadFramesAsChunkedZips(total: number): Promise<void> {
    const CHUNK_SIZE = 200;
    const chunkCount = Math.ceil(total / CHUNK_SIZE);
    this.snackBar.open(`Saving ${total} frames in ${chunkCount} ZIP file(s)...`, undefined, { duration: 0 });
    const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

    for (let chunk = 0; chunk < chunkCount; chunk++) {
      const start = chunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, total);
      this.offlineProgress.set(`ZIP ${chunk + 1}/${chunkCount}: packing frames ${start}–${end - 1}...`);
      await yieldToUI();

      const zip = new JSZip();
      const folder = zip.folder('frames')!;
      for (let i = start; i < end; i++) {
        folder.file(`frame_${String(i).padStart(6, '0')}.png`, this.capturedFrames[i]);
      }
      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'STORE' },
        meta => this.offlineProgress.set(`ZIP ${chunk + 1}/${chunkCount}: ${meta.percent.toFixed(0)}%`),
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = chunkCount === 1
        ? 'frames.zip'
        : `frames_part${String(chunk + 1).padStart(2, '0')}.zip`;
      a.click();
      await new Promise(resolve => setTimeout(resolve, 1000));
      URL.revokeObjectURL(url);
      await yieldToUI();
    }

    this.offlineProgress.set(`Done! Downloaded ${total} frames in ${chunkCount} ZIP(s).`);
    this.snackBar.open(`Downloaded ${total} frames`, 'OK', { duration: 5000 });
  }
}
