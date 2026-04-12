declare module 'cross-zip' {
  export function zipSync(inPath: string, outPath: string): void;
  export function unzipSync(inPath: string, outPath: string): void;
  export function zip(
    inPath: string,
    outPath: string,
    cb: (err?: Error) => void,
  ): void;
  export function unzip(
    inPath: string,
    outPath: string,
    cb: (err?: Error) => void,
  ): void;
}
