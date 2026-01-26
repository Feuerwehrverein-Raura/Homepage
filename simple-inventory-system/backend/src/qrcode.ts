import QRCode from 'qrcode';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

// Logo path - can be overridden via environment variable
const LOGO_PATH = process.env.LOGO_PATH || path.join(process.cwd(), 'assets', 'logo.png');
const BASE_URL = process.env.PUBLIC_URL || 'https://inventar.fwv-raura.ch';

interface QRCodeOptions {
  size?: number;        // QR code size in pixels (default: 300)
  logoSize?: number;    // Logo size as percentage of QR code (default: 20)
  margin?: number;      // QR code margin (default: 2)
}

/**
 * Generate a QR code with the FWV logo in the center
 * Uses high error correction (H) to allow for logo overlay
 */
export async function generateQRCodeWithLogo(
  customBarcode: string,
  options: QRCodeOptions = {}
): Promise<Buffer> {
  const {
    size = 300,
    logoSize = 20, // 20% of QR code
    margin = 2,
  } = options;

  // Generate URL that will be encoded in the QR code
  const url = getItemUrl(customBarcode);

  // Generate QR code as PNG buffer with high error correction for logo support
  const qrBuffer = await QRCode.toBuffer(url, {
    type: 'png',
    width: size,
    margin: margin,
    errorCorrectionLevel: 'H', // High (30%) - needed for logo overlay
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });

  // If no logo file exists, return QR code without logo
  if (!fs.existsSync(LOGO_PATH)) {
    console.warn('Logo file not found at:', LOGO_PATH, '- generating QR code without logo');
    return qrBuffer;
  }

  try {
    // Calculate logo dimensions (percentage of QR code size)
    const logoPixelSize = Math.floor(size * (logoSize / 100));

    // Add white padding around logo for better visibility
    const padding = Math.floor(logoPixelSize * 0.1);
    const totalLogoSize = logoPixelSize + padding * 2;

    // Create white background for logo
    const whiteBg = await sharp({
      create: {
        width: totalLogoSize,
        height: totalLogoSize,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    }).png().toBuffer();

    // Resize logo to fit
    const logo = await sharp(LOGO_PATH)
      .resize(logoPixelSize, logoPixelSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .toBuffer();

    // Composite logo onto white background
    const logoWithBg = await sharp(whiteBg)
      .composite([{
        input: logo,
        top: padding,
        left: padding
      }])
      .png()
      .toBuffer();

    // Calculate position to center logo in QR code
    const logoPosition = Math.floor((size - totalLogoSize) / 2);

    // Composite QR code with logo
    const result = await sharp(qrBuffer)
      .composite([{
        input: logoWithBg,
        top: logoPosition,
        left: logoPosition
      }])
      .png()
      .toBuffer();

    return result;
  } catch (error) {
    console.error('Error adding logo to QR code:', error);
    // Return QR code without logo if compositing fails
    return qrBuffer;
  }
}

/**
 * Generate the URL for an item based on its barcode
 */
export function getItemUrl(customBarcode: string): string {
  return `${BASE_URL}/item/${customBarcode}`;
}

/**
 * Generate a simple QR code without logo
 */
export async function generateSimpleQRCode(
  customBarcode: string,
  size: number = 200
): Promise<Buffer> {
  const url = getItemUrl(customBarcode);

  return QRCode.toBuffer(url, {
    type: 'png',
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });
}
