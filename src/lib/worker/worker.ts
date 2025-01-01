import PouchDB from 'pouchdb-browser';
import * as Comlink from 'comlink';
import PQueue from 'p-queue';
import { OfflineTile } from '../type';
import retryUntilWritten from '../retry';

class Worker {
  db: PouchDB.Database<OfflineTile>;
  isDebug: boolean;
  profiling: boolean;
  queue: PQueue;
  debug: Console['debug'];

  constructor() {
    this.db = new PouchDB('offline-tiles');
    this.isDebug = false;
    // openstreetmap tile server have rate limit. It will return 418 when too many request
    this.queue = new PQueue({ concurrency: 3, intervalCap: 2, interval: 500 });
    this.profiling = false;
    console.debug(`[web worker] Worker created`);
    this.debug = function () {};
  }

  setDebug(debug: boolean) {
    this.isDebug = Boolean(debug);
    if (this.isDebug) {
      this.debug = console.debug.bind(console);
    } else {
      this.debug = function () {};
    }
  }
  setProfiling(profiling: boolean) {
    this.profiling = Boolean(profiling);
  }

  fetchPromise = async (
    format: string,
    tileDbKeyId: string,
    tileUrl: string,
  ) => {
    let data:
      | (PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta)
      | null = null;
    try {
      data = await this.db.get(tileDbKeyId, { revs_info: true });
    } catch {
      //
    }
    const t0 = performance.now();
    try {
      this.debug(`[web worker] No data found in _seedOneTile`, {
        tileUrl,
        tileDbKeyId,
      });
      const response = await fetch(tileUrl, {
        headers: {
          Accept:
            'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });
      const blob = await response.blob();
      if (blob) {
        this.debug(`[web worker] SaveTileBlobThread: Saving`, {
          tileUrl,
          tileDbKeyId,
        });
        await retryUntilWritten(this.db, {
          _id: tileDbKeyId,
          _rev: data?._rev,
          timestamp: Date.now(),
          _attachments: {
            tile: {
              content_type: format,
              data: blob,
            },
          },
        });
        const t1 = performance.now();
        this.debug(`[web worker] Done`, {
          tileUrl,
          tileDbKeyId,
        });
        if (this.profiling) {
          console.log(
            `[web worker] SaveTile ${tileUrl} took ${Math.ceil(
              t1 - t0,
            )} milliseconds.`,
          );
        }
      } else {
        this.debug(`[web worker] ${tileUrl}: No data returned`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  async saveTile(
    format: string,
    override: boolean,
    tileDbKeyId: string,
    tileUrl: string,
  ) {
    try {
      const data = await this.db.get(tileDbKeyId);
      if (!override && data) {
        this.debug('[web worker] No override for tileDbKeyId', { tileDbKeyId });
        return;
      }
    } catch {
      //
    }
    this.queue.add(() => this.fetchPromise(format, tileDbKeyId, tileUrl));
  }
}

Comlink.expose(new Worker());

export type WorkerType = Worker;
