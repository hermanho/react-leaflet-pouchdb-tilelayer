import { OfflineTile } from './type';

const retryUntilWritten = async (
  db: PouchDB.Database<OfflineTile>,
  doc: PouchDB.Core.PutDocument<OfflineTile>,
  i = 0,
): Promise<PouchDB.Core.Response> => {
  try {
    return db.put(doc);
  } catch (err) {
    if (i > 10) {
      //prevent infinite loop
      console.error(`Error in retryUntilWritten and loop over 10 times`);
      console.error(err);
      throw err;
    }
    const p = new Promise<PouchDB.Core.Response>((resolve) => {
      setTimeout(() => {
        resolve(retryUntilWritten(db, doc, i++));
      }, 50);
    });
    return p;
  }
};

export default retryUntilWritten;
