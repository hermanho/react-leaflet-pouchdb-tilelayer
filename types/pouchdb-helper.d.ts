/// <reference types="pouchdb-find" />
/// <reference types="pouchdb-core" />
/// <reference types="pouchdb-mapreduce" />
/// <reference types="pouchdb-replication" />
export declare function retryUntilWritten<T>(db: PouchDB.Database<T>, doc: PouchDB.Core.Document<T> & PouchDB.Core.GetMeta): Promise<PouchDB.Core.Response>;
