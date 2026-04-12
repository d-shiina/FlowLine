declare module 'yauzl' {
  import { Readable } from 'stream';

  export interface Entry {
    fileName: string;
    uncompressedSize: number;
    compressedSize: number;
  }

  interface ZipFile {
    entryCount: number;
    readEntry(): void;
    on(event: 'entry', cb: (entry: Entry) => void): this;
    on(event: 'end', cb: () => void): this;
    on(event: 'error', cb: (err: Error) => void): this;
    openReadStream(entry: Entry, cb: (err: Error | null, stream?: Readable) => void): void;
    close(): void;
  }

  interface Options {
    lazyEntries?: boolean;
    autoClose?: boolean;
  }

  function open(
    path: string,
    options: Options,
    cb: (err: Error | null, zipfile?: ZipFile) => void,
  ): void;
}
