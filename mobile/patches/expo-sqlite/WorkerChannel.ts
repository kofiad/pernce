// @ts-nocheck: vendored from expo-sqlite 58, typed against its own lib.
// From expo-sqlite 58.0.13 (web/WorkerChannel.ts), swapped in by
// metro.config.js. The only change is in invokeWorkerSync: 58 gives up on a
// synchronous call after 1,000,000 spins of Atomics.pause(), about 16 ms in
// Chromium, so any query or write that keeps the worker busy longer
// throws "Sync operation timeout" (onboarding and sign-in hit it). This
// waits up to 10 seconds of real time instead. The page is frozen while it
// waits, so after a timeout later calls fail at once until the worker
// answers the stuck one, rather than each queueing behind it for another
// 10 seconds. Delete this file and the metro.config.js override once
// expo-sqlite times out by the clock.
// Copyright 2015-present 650 Industries. All rights reserved.

import { Deferred } from '../../node_modules/expo-sqlite/web/Deferred';
import { serialize, deserialize } from '../../node_modules/expo-sqlite/web/SyncSerializer';
import {
  type SQLiteWorkerMessageType,
  type MessageTypeMap,
  type ResultType,
  type ResultTypeMap,
} from '../../node_modules/expo-sqlite/web/web.types';

let messageId = 0;
const deferredMap = new Map<number, Deferred>();
const PENDING = 1;
const RESOLVED = 2;

let hasWarnedSync = false;

/**
 * For worker to send result to the main thread.
 */
export function sendWorkerResult({
  id,
  result,
  error,
  syncTrait,
}: {
  id: number;
  result: ResultType | null;
  error: Error | null;
  syncTrait?: {
    lockBuffer: SharedArrayBuffer;
    resultBuffer: SharedArrayBuffer;
  };
}) {
  // Send the message as a string. An Error doesn't survive JSON, and `String(error)` keeps it non-empty.
  const errorMessage = error != null ? error.message || String(error) : null;
  if (syncTrait) {
    const { lockBuffer, resultBuffer } = syncTrait;
    const lock = new Int32Array(lockBuffer);
    let resultBytes = new TextEncoder().encode(
      errorMessage != null ? serialize({ error: errorMessage }) : serialize({ result })
    );
    if (resultBytes.length + 4 > resultBuffer.byteLength) {
      resultBytes = new TextEncoder().encode(
        serialize({
          error: `The synchronous result is ${resultBytes.length} bytes, which is more than the ${resultBuffer.byteLength - 4} bytes that synchronous calls can return on web. Use the async API for large results.`,
        })
      );
    }
    new Uint32Array(resultBuffer, 0, 1)[0] = resultBytes.length;
    new Uint8Array(resultBuffer).set(resultBytes, 4);
    Atomics.store(lock, 0, RESOLVED);
  } else {
    if (error != null) {
      self.postMessage({ id, error: errorMessage });
    } else {
      self.postMessage({ id, result });
    }
  }
}

/**
 * For main thread to handle worker messages.
 */
export function workerMessageHandler(event: MessageEvent) {
  const { id, result, error, isSync } = event.data;
  if (!isSync) {
    const deferred = deferredMap.get(id);
    if (deferred) {
      if (error) {
        deferred.reject(new Error(error));
      } else {
        deferred.resolve(result);
      }
      deferredMap.delete(id);
    }
  }
}

/**
 * For main thread to invoke worker function asynchronously.
 */
export async function invokeWorkerAsync<T extends SQLiteWorkerMessageType & keyof ResultTypeMap>(
  worker: Worker,
  type: T,
  data: MessageTypeMap[T]['data']
): Promise<ResultTypeMap[T]> {
  const id = messageId++;
  const deferred = new Deferred<ResultTypeMap[T]>();
  deferredMap.set(id, deferred);
  worker.postMessage({ type, id, data, isSync: false });
  return deferred.getPromise();
}

/**
 * For main thread to invoke worker function synchronously.
 */
const SYNC_TIMEOUT_MS = 10_000;
/** The lock of a call that timed out, until the worker answers it. */
let stuckLock: Int32Array | null = null;

export function invokeWorkerSync<T extends SQLiteWorkerMessageType & keyof ResultTypeMap>(
  worker: Worker,
  type: T,
  data: MessageTypeMap[T]['data']
): ResultTypeMap[T] {
  if (__DEV__ && !hasWarnedSync) {
    console.warn(
      'Using synchronous SQLite operations can cause significant performance impact. Consider using async operations instead.'
    );
    hasWarnedSync = true;
  }

  if (stuckLock && Atomics.load(stuckLock, 0) === PENDING) {
    throw new Error('The database stopped responding. Reload the page.');
  }
  stuckLock = null;

  const id = messageId++;
  const lockBuffer = new SharedArrayBuffer(4);
  const lock = new Int32Array(lockBuffer);
  const resultBuffer = new SharedArrayBuffer(1024 * 1024);
  const resultArray = new Uint8Array(resultBuffer);

  Atomics.store(lock, 0, PENDING);
  worker.postMessage({
    type,
    id,
    data,
    isSync: true,
    lockBuffer,
    resultBuffer,
  });

  const deadline = performance.now() + SYNC_TIMEOUT_MS;
  // @ts-expect-error: Remove this when TypeScript supports Atomics.pause
  const useAtomicsPause = typeof Atomics.pause === 'function';
  while (Atomics.load(lock, 0) === PENDING) {
    if (performance.now() > deadline) {
      stuckLock = lock;
      throw new Error('Sync operation timeout');
    }
    if (useAtomicsPause) {
      // @ts-expect-error: Remove this when TypeScript supports Atomics.pause
      Atomics.pause();
    }
  }

  const length = new Uint32Array(resultArray.buffer, 0, 1)[0];
  const resultCopy = new Uint8Array(length);
  resultCopy.set(new Uint8Array(resultArray.buffer, 4, length));
  const resultJson = new TextDecoder().decode(resultCopy);
  const { result, error } = deserialize<{ result: ResultTypeMap[T]; error?: string }>(resultJson);
  if (error) throw new Error(error);
  return result;
}
