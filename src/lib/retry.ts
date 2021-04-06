import PouchDB from "pouchdb-browser";
import { OfflineTile } from "./type";

const retryUntilWritten = async (
  db: PouchDB.Database<OfflineTile>,
  doc: PouchDB.Core.PutDocument<OfflineTile>,
  i = 0
): Promise<PouchDB.Core.Response> => {
  // try {
  //   const origDoc = await db.get(doc._id);
  //   doc._rev = origDoc._rev;
  // } catch (err) {
  //   if (err.status !== 404) {
  //     console.error(`Error in retryUntilWritten`);
  //     console.error(err);
  //   }
  // }
  try {
    return db.put(doc);
  } catch (err) {
    if (i > 10) {
      //prevent infinite loop
      console.error(`Error in retryUntilWritten and loop over 10 times`);
      console.error(err);
      throw err;
    }
    const p = new Promise<PouchDB.Core.Response>((resolve, reject) => {
      setTimeout(() => {
        resolve(retryUntilWritten(db, doc, i++));
      }, 50)
    });
    return p;
  }
};

export default retryUntilWritten;
