declare module 'escpos' {
  export class Printer {
    constructor(device: any);
    font(type: string): this;
    align(alignment: string): this;
    style(style: string): this;
    size(width: number, height: number): this;
    text(content: string): this;
    cut(): this;
    close(callback?: () => void): void;
  }
}

declare module 'escpos-network' {
  class Network {
    constructor(address: string, port?: number);
    open(callback: (error?: Error) => void): void;
    close(callback?: () => void): void;
  }
  export = Network;
}
