declare module 'word-extractor' {
  import type { Buffer } from 'node:buffer';

  interface TextOptions {
    filterUnicode?: boolean;
  }

  interface ExtractedDocument {
    getAnnotations(options?: TextOptions): string;
    getBody(options?: TextOptions): string;
    getEndnotes(options?: TextOptions): string;
    getFooters(options?: TextOptions): string;
    getFootnotes(options?: TextOptions): string;
    getHeaders(options?: TextOptions & { includeFooters?: boolean }): string;
    getTextboxes(
      options?: TextOptions & { includeBody?: boolean; includeHeadersAndFooters?: boolean },
    ): string;
  }

  export default class WordExtractor {
    extract(source: string | Buffer): Promise<ExtractedDocument>;
  }
}
