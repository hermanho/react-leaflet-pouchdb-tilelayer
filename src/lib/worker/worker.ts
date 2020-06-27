import PouchDB from "pouchdb-browser";
import * as Comlink from "comlink";
import { OfflineTile } from "../type";

const retryUntilWritten = async (db, doc, i = 0) => {
  try {
    const origDoc = await db.get(doc._id);
    doc._rev = origDoc._rev;
  } catch (err) {
    if (err.status !== 404) {
      console.debug(`Error in retryUntilWritten`);
      console.debug(err);
    }
  }
  try {
    return db.put(doc);
  } catch (err) {
    if (i > 10) {
      //prevent infinite loop
      console.error(`Error in retryUntilWritten and loop over 10 times`);
      console.error(err);
      throw err;
    }
    return retryUntilWritten(db, doc, i++);
  }
};

class Worker {
  db?: PouchDB.Database<OfflineTile>;

  constructor() {
    this.db = new PouchDB("offline-tiles");
    console.debug("Worker created");
  }

  async saveTile(
    format: string,
    override: boolean,
    tileUrl: string,
    existingRevision?: string
  ) {
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
      console.debug(`No data for ${tileUrl} in _seedOneTile`);
      const response = await fetch(tileUrl);
      const blob = await response.blob();
      console.debug(`saveTileBlobThread: Saving ${tileUrl}`);
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
      console.debug(`${tileUrl}: Done`);
    } catch (err) {
      console.error(err);
    }
  }
}

Comlink.expose(new Worker());

export type WorkerType = Worker;
