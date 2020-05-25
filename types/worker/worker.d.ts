/// <reference types="pouchdb-find" />
/// <reference types="pouchdb-core" />
/// <reference types="pouchdb-mapreduce" />
/// <reference types="pouchdb-replication" />
import { OfflineTile } from "../../type";
declare class Worker {
    db?: PouchDB.Database<OfflineTile>;
    constructor();
    saveTile(format: string, override: boolean, tileUrl: string, existingRevision?: string): Promise<void>;
}
export declare type WorkerType = Worker;
export {};
