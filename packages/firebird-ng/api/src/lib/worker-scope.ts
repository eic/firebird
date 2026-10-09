/**
 * The part of a worker's global scope the worker code uses. A worker entry
 * module passes its `self`; specs pass a fake.
 */
export interface WorkerScope {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}
