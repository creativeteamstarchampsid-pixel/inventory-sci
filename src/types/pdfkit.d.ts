declare module "pdfkit" {
  import type { Readable } from "node:stream";

  export interface PDFDocumentInfo {
    Title?: string;
    Author?: string;
    Subject?: string;
    Keywords?: string;
    Creator?: string;
    Producer?: string;
    CreationDate?: Date;
    ModificationDate?: Date;
  }

  export interface PDFDocumentOptions {
    compress?: boolean;
    subset?: string;
    pdfVersion?: string;
    lang?: string;
    displayTitle?: boolean;
    autoFirstPage?: boolean;
    info?: PDFDocumentInfo;
    [key: string]: unknown;
  }

  export default class PDFDocument extends Readable {
    constructor(options?: PDFDocumentOptions);
    end(): void;
  }
}
