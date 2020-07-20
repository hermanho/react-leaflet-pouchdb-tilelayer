import PouchDB from "pouchdb-browser";
import * as Comlink from "comlink";
import { OfflineTile } from "../type";
import retryUntilWritten from "../retry";

class Worker {
  db?: PouchDB.Database<OfflineTile>;
  debug: boolean;
  profiling: boolean;
  queue = [];
  busy = 0;

  constructor() {
    this.db = new PouchDB("offline-tiles");
    this.debug = false;
    console.debug("Worker created");
  }

  setDebug(debug: boolean) {
    this.debug = debug;
  }
  setProfiling(profiling: boolean) {
    this.profiling = profiling;
  }

  async saveTile(
    format: string,
    override: boolean,
    tileUrl: string,
    existingRevision?: string
  ) {
    const queueItem = () => {
      Promise.resolve().then(async () => {
        const t0 = performance.now();
        try {
          if (!override) {
            try {
              const data = await this.db.get(tileUrl);
              if (data) {
                return;
              }
            } catch {
              //
            }
          }
          this.debug && console.debug(`No data for ${tileUrl} in _seedOneTile`);
          const response = await fetch(tileUrl);
          const blob = await response.blob();
          this.debug && console.debug(`saveTileBlobThread: Saving ${tileUrl}`);
          await retryUntilWritten(this.db, {
            _id: tileUrl,
            _rev: existingRevision,
            timestamp: Date.now(),
            _attachments: {
              tile: {
                // eslint-disable-next-line @typescript-eslint/camelcase
                content_type: format,
                data: blob,
              },
            },
          });
          const t1 = performance.now();
          this.debug && console.debug(`${tileUrl}: Done`);
          this.profiling &&
            console.log(
              `web worker saveTile ${tileUrl} took ${t1 - t0} milliseconds.`
            );
        } catch (err) {
          console.error(err);
        }
      });
    };

    this.queue.push(queueItem);
    if (this.busy <= 3) {
      setTimeout(() => this.tryNext());
      this.busy++;
    }
  }

  tryNext() {
    if (this.queue.length === 0) {
      this.busy--;
      return;
    }
    const queueItem = this.queue.shift();
    queueItem();
    setTimeout(() => this.tryNext());
  }
}

Comlink.expose(new Worker());

export type WorkerType = Worker;
