declare module 'yazl' {
  import { Readable } from 'stream';

  class ZipFile {
    outputStream: Readable;
    addBuffer(buffer: Buffer, metadataPath: string, options?: { compress?: boolean }): void;
    addFile(realPath: string, metadataPath: string, options?: { compress?: boolean }): void;
    end(): void;
  }

  export { ZipFile };
}
