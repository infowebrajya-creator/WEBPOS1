/**
 * High-performance ESC/POS Command Builder for Thermal Printers
 * Compiles raw receipt components to a byte buffer, then exports as Hex string.
 */
export class ESCPOSBuilder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  // Helper to append a single byte
  public writeByte(b: number): this {
    this.buffer.push(b & 0xff);
    return this;
  }

  // Helper to append multiple bytes
  public writeBytes(bytes: number[]): this {
    for (const b of bytes) {
      this.buffer.push(b & 0xff);
    }
    return this;
  }

  // Helper to convert character string to UTF-8 bytes (supporting ₹ currency symbol and standard ASCII)
  public writeText(text: string): this {
    const encoded = new TextEncoder().encode(text);
    for (let i = 0; i < encoded.length; i++) {
      this.buffer.push(encoded[i]);
    }
    return this;
  }

  // Initialize printer
  public init(): this {
    this.writeBytes([0x1b, 0x40]); // ESC @ (Initialize)
    // Select UTF-8 code page (FS ( C) on modern ESC/POS thermal printers
    this.writeBytes([0x1c, 0x28, 0x43, 0x02, 0x00, 0x30, 0x02]);
    return this;
  }

  // Alignments
  public alignLeft(): this {
    return this.writeBytes([0x1b, 0x61, 0x00]);
  }

  public alignCenter(): this {
    return this.writeBytes([0x1b, 0x61, 0x01]);
  }

  public alignRight(): this {
    return this.writeBytes([0x1b, 0x61, 0x02]);
  }

  // Stylings
  public bold(on: boolean): this {
    return this.writeBytes([0x1b, 0x45, on ? 0x01 : 0x00]);
  }

  public doubleSize(on: boolean): this {
    return this.writeBytes([0x1d, 0x21, on ? 0x11 : 0x00]);
  }

  public doubleHeight(on: boolean): this {
    return this.writeBytes([0x1d, 0x21, on ? 0x01 : 0x00]);
  }

  public doubleWidth(on: boolean): this {
    return this.writeBytes([0x1d, 0x21, on ? 0x10 : 0x00]);
  }

  // Line spacing
  public lineSpacingDefault(): this {
    return this.writeBytes([0x1b, 0x32]);
  }

  public lineSpacingCustom(dots: number): this {
    return this.writeBytes([0x1b, 0x33, dots]);
  }

  // Feeds
  public feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.writeByte(0x0a);
    }
    return this;
  }

  // Cuts
  public cutFull(): this {
    return this.writeBytes([0x1d, 0x56, 0x41, 0x00]); // GS V 65 0
  }

  public cutPartial(): this {
    return this.writeBytes([0x1d, 0x56, 0x42, 0x00]); // GS V 66 0
  }

  // Pulse cash drawer
  public pulseCashDrawer(): this {
    return this.writeBytes([0x1b, 0x70, 0x00, 0x19, 0x96]); // ESC p 0 25 150 (pin 2)
  }

  // Barcode (Code128 format)
  public writeBarcode(text: string): this {
    const clean = text.replace(/[^a-zA-Z0-9-]/g, "").toUpperCase();
    if (!clean) return this;

    // Set height to 64 dots
    this.writeBytes([0x1d, 0x68, 0x40]);
    // Set width to 2
    this.writeBytes([0x1d, 0x77, 0x02]);
    // Set text position to below
    this.writeBytes([0x1d, 0x48, 0x02]);
    // Send barcode Code128 command (GS k 73 len data)
    this.writeBytes([0x1d, 0x6b, 0x49, clean.length]);
    this.writeText(clean);
    return this;
  }

  // Native QR Code Generation using GS ( k command group
  public writeQRCode(text: string): this {
    if (!text) return this;

    const dataBytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
      dataBytes.push(text.charCodeAt(i) & 0xff);
    }

    const k = dataBytes.length;
    const len = k + 3;
    const pL = len & 0xff;
    const pH = (len >> 8) & 0xff;

    // 1. Set QR Code Model (Model 2, hex: 1d 28 6b 04 00 31 41 32 00)
    this.writeBytes([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);

    // 2. Set QR Code cell/module size (Size 6, hex: 1d 28 6b 03 00 31 43 06)
    this.writeBytes([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]);

    // 3. Set error correction level (Medium 'M' ~15%, hex: 1d 28 6b 03 00 31 45 31)
    this.writeBytes([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]);

    // 4. Store QR Code data in symbol storage area
    // GS ( k pL pH cn fn m d1...dk (cn=49, fn=80, m=48)
    this.writeBytes([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]);
    this.writeBytes(dataBytes);

    // 5. Print the QR symbol
    // GS ( k pL pH cn fn m (cn=49, fn=81, m=48)
    this.writeBytes([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);

    return this;
  }

  // Compile helper to export compiled bytes as an upper-case hex string
  public compileHex(): string {
    return this.buffer
      .map((b) => ("0" + b.toString(16)).slice(-2))
      .join("")
      .toUpperCase();
  }

  // Compile helper to export compiled bytes directly as Uint8Array
  public compileBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  // Clear builder state
  public clear(): void {
    this.buffer = [];
    this.init();
  }

  // --- HIGHER LEVEL FORMATTING HELPERS ---

  public divider(width: "58mm" | "80mm" = "80mm", double: boolean = false): this {
    const chars = width === "80mm" ? 40 : 32;
    const char = double ? "=" : "-";
    return this.writeText(char.repeat(chars) + "\n");
  }

  // Formats item line with spaces nicely depending on character width
  public itemRow(name: string, qty: string, price: string, total: string, width: "58mm" | "80mm" = "80mm"): this {
    const lineChars = width === "80mm" ? 48 : 32;
    
    if (width === "58mm") {
      // 58mm layout (32 chars) - row 1: name, row 2: Qty @ Price = Total (or aligned)
      // Name (Left aligned)
      this.alignLeft().writeText(name + "\n");
      
      // Qty x Price = Total row
      const details = `${qty} x ${price}`;
      const spacesNeeded = lineChars - details.length - total.length;
      const spacer = " ".repeat(Math.max(1, spacesNeeded));
      return this.writeText(details + spacer + total + "\n");
    } else {
      // 80mm layout (48 chars) - all in one row nicely aligned
      // QTY: 4 chars, NAME: 24 chars, PRICE: 10 chars, TOTAL: 10 chars
      const colQty = qty.padEnd(4);
      
      let colName = name;
      if (colName.length > 22) {
        colName = colName.substring(0, 19) + "...";
      }
      colName = colName.padEnd(24);
      
      const colPrice = price.padStart(9);
      const colTotal = total.padStart(11);
      
      return this.writeText(colQty + colName + colPrice + colTotal + "\n");
    }
  }

  // Formats double column totals
  public totalRow(label: string, value: string, width: "58mm" | "80mm" = "80mm"): this {
    const lineChars = width === "80mm" ? 48 : 32;
    const spacesNeeded = lineChars - label.length - value.length;
    const spacer = " ".repeat(Math.max(1, spacesNeeded));
    return this.writeText(label + spacer + value + "\n");
  }
}
export default ESCPOSBuilder;
