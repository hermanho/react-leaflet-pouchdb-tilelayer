import { OfflineTile } from "./type";

const retryUntilWritten = async (
  db: PouchDB.Database<OfflineTile>,
  doc: PouchDB.Core.PutDocument<OfflineTile>,
  i = 0
) => {
  try {
    const origDoc = await db.get(doc._id);
    doc._rev = origDoc._rev;
  } catch (err) {
    if (err.status !== 404) {
      console.error(`Error in retryUntilWritten`);
      console.error(err);
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

export default retryUntilWritten;
