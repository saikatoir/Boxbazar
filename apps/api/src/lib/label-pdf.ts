import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import bwipjs from 'bwip-js';

export type LabelData = {
  courier: 'steadfast' | 'pathao' | 'redx';
  trackingCode: string;
  invoiceId: string;
  consignmentId: string;
  storeName: string;
  recipient: {
    name: string;
    phone: string;
    addressLine: string;
    city: string;
    zone?: string;
    area?: string;
  };
  codAmount: number;
  weightKg?: number;
  itemDescription: string;
  createdAt: Date;
};

const POINTS_PER_INCH = 72;
// 4 x 6 inch label
const WIDTH = 4 * POINTS_PER_INCH;
const HEIGHT = 6 * POINTS_PER_INCH;

async function renderBarcode(text: string): Promise<Uint8Array> {
  const png = await bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 2,
    height: 14,
    includetext: false,
    backgroundcolor: 'FFFFFF',
  });
  return new Uint8Array(png);
}

/**
 * pdf-lib's standard fonts only support WinAnsi. Until we ship an embedded
 * Bangla TTF (planned for Phase 8), strip anything outside the printable
 * Latin-1 range so the PDF never errors out mid-render. The courier label
 * is consumed by delivery riders who can read Banglish addresses fine.
 */
function sanitize(text: string): string {
  return text.replace(/[^\x20-\xFE]/g, '?');
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

export async function generateLabelPdf(data: LabelData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([WIDTH, HEIGHT]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  const gray = rgb(0.5, 0.5, 0.5);
  const lineColor = rgb(0.85, 0.85, 0.85);

  let y = HEIGHT - 18;

  // Header
  page.drawText(sanitize(data.storeName).slice(0, 32), {
    x: 14,
    y,
    size: 14,
    font: bold,
    color: black,
  });
  page.drawText(data.courier.toUpperCase(), {
    x: WIDTH - 14 - 60,
    y,
    size: 12,
    font: bold,
    color: black,
  });
  y -= 22;

  page.drawLine({
    start: { x: 12, y },
    end: { x: WIDTH - 12, y },
    thickness: 1,
    color: lineColor,
  });
  y -= 14;

  // Recipient block
  page.drawText('TO:', { x: 14, y, size: 9, font: bold, color: gray });
  y -= 13;
  page.drawText(sanitize(data.recipient.name).slice(0, 40), {
    x: 14,
    y,
    size: 13,
    font: bold,
    color: black,
  });
  y -= 15;
  page.drawText(data.recipient.phone, { x: 14, y, size: 11, font, color: black });
  y -= 14;

  const addressLines = wrap(
    sanitize(
      [
        data.recipient.addressLine,
        [data.recipient.area, data.recipient.zone, data.recipient.city]
          .filter(Boolean)
          .join(', '),
      ]
        .filter(Boolean)
        .join(' - ')
    ),
    44
  );
  for (const line of addressLines.slice(0, 4)) {
    page.drawText(line, { x: 14, y, size: 10, font, color: black });
    y -= 12;
  }

  y -= 6;
  page.drawLine({
    start: { x: 12, y },
    end: { x: WIDTH - 12, y },
    thickness: 1,
    color: lineColor,
  });
  y -= 16;

  // COD block — large, top right.
  // We deliberately use "Tk" instead of "৳" because the standard PDF
  // Helvetica encoding cannot render Bangla glyphs.
  const codText = `Tk ${data.codAmount.toLocaleString('en-IN')}`;
  page.drawText('COD', { x: WIDTH - 14 - 90, y, size: 9, font: bold, color: gray });
  page.drawText(codText, {
    x: WIDTH - 14 - 90,
    y: y - 18,
    size: 20,
    font: bold,
    color: black,
  });

  page.drawText('INVOICE', { x: 14, y, size: 9, font: bold, color: gray });
  page.drawText(data.invoiceId, {
    x: 14,
    y: y - 14,
    size: 12,
    font: bold,
    color: black,
  });
  y -= 36;

  page.drawLine({
    start: { x: 12, y },
    end: { x: WIDTH - 12, y },
    thickness: 1,
    color: lineColor,
  });
  y -= 14;

  // Items
  page.drawText('ITEMS', { x: 14, y, size: 9, font: bold, color: gray });
  y -= 12;
  const itemLines = wrap(sanitize(data.itemDescription), 50);
  for (const line of itemLines.slice(0, 4)) {
    page.drawText(line, { x: 14, y, size: 10, font, color: black });
    y -= 12;
  }

  if (data.weightKg != null) {
    page.drawText(`WT: ${data.weightKg} kg`, {
      x: WIDTH - 14 - 70,
      y: y + 14,
      size: 9,
      font,
      color: gray,
    });
  }

  // Barcode at the bottom
  try {
    const png = await renderBarcode(data.trackingCode);
    const img = await pdf.embedPng(png);
    const targetW = WIDTH - 28;
    const targetH = 60;
    page.drawImage(img, {
      x: 14,
      y: 36,
      width: targetW,
      height: targetH,
    });
  } catch (err) {
    // Fall back to plain text if barcode render fails.
    page.drawText(data.trackingCode, {
      x: 14,
      y: 60,
      size: 14,
      font: bold,
      color: black,
    });
  }
  page.drawText(data.trackingCode, {
    x: 14,
    y: 22,
    size: 10,
    font,
    color: black,
  });
  page.drawText(
    `Issued ${data.createdAt.toISOString().slice(0, 10)}`,
    {
      x: WIDTH - 14 - 110,
      y: 22,
      size: 8,
      font,
      color: gray,
    }
  );

  return pdf.save();
}
