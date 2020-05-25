declare const W: {
    retryUntilWritten: (db: any, doc: any) => any;
    saveTileBlobThread: (format: any, tileUrl: any, existingRevision: any) => Promise<void>;
};
export declare type TileWorkerType = typeof W;
export {};
