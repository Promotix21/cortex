import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle,
} from 'docx';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

// ============================================================
// TYPES
// ============================================================

interface DocContent {
  type: 'heading' | 'paragraph' | 'table' | 'list' | 'pagebreak';
  level?: 1 | 2 | 3 | 4;          // heading level
  text?: string;
  bold?: boolean;
  italic?: boolean;
  items?: string[];                 // list items
  headers?: string[];               // table headers
  rows?: string[][];                // table rows
}

interface CreateDocRequest {
  filename: string;                 // output file name (e.g. "report.docx")
  output_dir: string;               // directory to write to
  title?: string;
  content: DocContent[];
}

interface CreateSpreadsheetRequest {
  filename: string;
  output_dir: string;
  sheets: {
    name: string;
    headers: string[];
    rows: (string | number)[][];
  }[];
}

interface ReadDocRequest {
  file_path: string;
}

// ============================================================
// DOCX BUILDER
// ============================================================

export async function createDocx(req: CreateDocRequest): Promise<{ path: string; size: number }> {
  const children: Paragraph[] = [];

  if (req.title) {
    children.push(
      new Paragraph({
        text: req.title,
        heading: HeadingLevel.TITLE,
        spacing: { after: 300 },
      })
    );
  }

  for (const block of req.content) {
    switch (block.type) {
      case 'heading':
        children.push(
          new Paragraph({
            text: block.text || '',
            heading: block.level === 1 ? HeadingLevel.HEADING_1
              : block.level === 2 ? HeadingLevel.HEADING_2
              : block.level === 3 ? HeadingLevel.HEADING_3
              : HeadingLevel.HEADING_4,
            spacing: { before: 240, after: 120 },
          })
        );
        break;

      case 'paragraph':
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: block.text || '',
                bold: block.bold,
                italics: block.italic,
                size: 24, // 12pt
              }),
            ],
            spacing: { after: 200 },
          })
        );
        break;

      case 'list':
        for (const item of block.items || []) {
          children.push(
            new Paragraph({
              text: item,
              bullet: { level: 0 },
              spacing: { after: 80 },
            })
          );
        }
        break;

      case 'pagebreak':
        children.push(
          new Paragraph({ children: [], pageBreakBefore: true })
        );
        break;
    }
  }

  // Handle tables separately (they're not Paragraph type)
  const docChildren: (Paragraph | Table)[] = [];
  for (const block of req.content) {
    if (block.type === 'table') {
      // Add table
      const tableRows: TableRow[] = [];

      // Header row
      if (block.headers) {
        tableRows.push(
          new TableRow({
            tableHeader: true,
            children: block.headers.map(h =>
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: h, bold: true, size: 22 })],
                  alignment: AlignmentType.LEFT,
                })],
                width: { size: Math.floor(100 / block.headers!.length), type: WidthType.PERCENTAGE },
              })
            ),
          })
        );
      }

      // Data rows
      for (const row of block.rows || []) {
        tableRows.push(
          new TableRow({
            children: row.map(cell =>
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: String(cell), size: 22 })],
                })],
              })
            ),
          })
        );
      }

      docChildren.push(
        new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        })
      );
      // Add spacing after table
      docChildren.push(new Paragraph({ text: '', spacing: { after: 200 } }));
    }
  }

  // Merge: put paragraphs/headings/lists first, then tables at their positions
  // Simple approach: build in order
  const finalChildren: (Paragraph | Table)[] = [];
  let tableIdx = 0;
  for (const block of req.content) {
    if (block.type === 'table') {
      if (tableIdx < docChildren.length) {
        finalChildren.push(docChildren[tableIdx]);
        tableIdx++;
        // spacing paragraph
        if (tableIdx < docChildren.length) {
          finalChildren.push(docChildren[tableIdx]);
          tableIdx++;
        }
      }
    } else if (block.type === 'heading') {
      finalChildren.push(
        new Paragraph({
          text: block.text || '',
          heading: block.level === 1 ? HeadingLevel.HEADING_1
            : block.level === 2 ? HeadingLevel.HEADING_2
            : block.level === 3 ? HeadingLevel.HEADING_3
            : HeadingLevel.HEADING_4,
          spacing: { before: 240, after: 120 },
        })
      );
    } else if (block.type === 'paragraph') {
      finalChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.text || '',
              bold: block.bold,
              italics: block.italic,
              size: 24,
            }),
          ],
          spacing: { after: 200 },
        })
      );
    } else if (block.type === 'list') {
      for (const item of block.items || []) {
        finalChildren.push(
          new Paragraph({
            text: item,
            bullet: { level: 0 },
            spacing: { after: 80 },
          })
        );
      }
    } else if (block.type === 'pagebreak') {
      finalChildren.push(new Paragraph({ children: [], pageBreakBefore: true }));
    }
  }

  // Add title at the beginning
  if (req.title) {
    finalChildren.unshift(
      new Paragraph({
        text: req.title,
        heading: HeadingLevel.TITLE,
        spacing: { after: 300 },
      })
    );
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: finalChildren,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(req.output_dir, req.filename);
  fs.writeFileSync(outputPath, buffer);

  return { path: outputPath, size: buffer.byteLength };
}

// ============================================================
// PDF BUILDER
// ============================================================

export async function createPdf(req: CreateDocRequest): Promise<{ path: string; size: number }> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(req.output_dir, req.filename);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Title
    if (req.title) {
      doc.fontSize(24).font('Helvetica-Bold').text(req.title, { align: 'center' });
      doc.moveDown(1.5);
    }

    for (const block of req.content) {
      switch (block.type) {
        case 'heading': {
          const sizes: Record<number, number> = { 1: 20, 2: 16, 3: 14, 4: 12 };
          doc.fontSize(sizes[block.level || 1] || 16)
            .font('Helvetica-Bold')
            .text(block.text || '');
          doc.moveDown(0.5);
          break;
        }

        case 'paragraph':
          doc.fontSize(11)
            .font(block.bold ? 'Helvetica-Bold' : block.italic ? 'Helvetica-Oblique' : 'Helvetica')
            .text(block.text || '');
          doc.moveDown(0.5);
          break;

        case 'list':
          doc.fontSize(11).font('Helvetica');
          for (const item of block.items || []) {
            doc.text(`  \u2022  ${item}`, { indent: 20 });
          }
          doc.moveDown(0.5);
          break;

        case 'table': {
          const headers = block.headers || [];
          const rows = block.rows || [];
          const colWidth = headers.length > 0 ? (doc.page.width - 100) / headers.length : 150;

          // Header
          if (headers.length > 0) {
            doc.font('Helvetica-Bold').fontSize(10);
            const y = doc.y;
            headers.forEach((h, i) => {
              doc.text(h, 50 + i * colWidth, y, { width: colWidth, continued: false });
            });
            doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
            doc.moveDown(0.3);
          }

          // Rows
          doc.font('Helvetica').fontSize(10);
          for (const row of rows) {
            const y = doc.y;
            row.forEach((cell, i) => {
              doc.text(String(cell), 50 + i * colWidth, y, { width: colWidth, continued: false });
            });
            doc.moveDown(0.1);
          }
          doc.moveDown(0.5);
          break;
        }

        case 'pagebreak':
          doc.addPage();
          break;
      }
    }

    doc.end();
    stream.on('finish', () => {
      const stat = fs.statSync(outputPath);
      resolve({ path: outputPath, size: stat.size });
    });
    stream.on('error', reject);
  });
}

// ============================================================
// SPREADSHEET BUILDER
// ============================================================

export async function createSpreadsheet(req: CreateSpreadsheetRequest): Promise<{ path: string; size: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Cortex';
  workbook.created = new Date();

  for (const sheet of req.sheets) {
    const ws = workbook.addWorksheet(sheet.name);

    // Headers
    ws.columns = sheet.headers.map(h => ({
      header: h,
      key: h.toLowerCase().replace(/\s+/g, '_'),
      width: Math.max(h.length + 4, 15),
    }));

    // Style header row
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Data rows
    for (const row of sheet.rows) {
      ws.addRow(row);
    }

    // Auto-filter
    if (sheet.rows.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: sheet.rows.length + 1, column: sheet.headers.length },
      };
    }
  }

  const outputPath = path.join(req.output_dir, req.filename);
  await workbook.xlsx.writeFile(outputPath);
  const stat = fs.statSync(outputPath);
  return { path: outputPath, size: stat.size };
}

// ============================================================
// READERS
// ============================================================

export async function readDocx(filePath: string): Promise<{ text: string; paragraphs: number }> {
  // Simple text extraction — read the XML inside the docx
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(filePath);
  const docXml = zip.readAsText('word/document.xml');

  // Strip XML tags to get text
  const text = docXml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();

  const paragraphs = text.split('\n').filter(l => l.trim()).length;
  return { text, paragraphs };
}

export async function readPdf(filePath: string): Promise<{ text: string; pages: number }> {
  // Basic PDF info — full text extraction requires pdf-parse (optional)
  const stat = fs.statSync(filePath);
  try {
    // Dynamic import — only works if pdf-parse is installed
    const mod = await import(/* @vite-ignore */ 'pdf-parse');
    const pdfParse = mod.default || mod;
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return { text: data.text, pages: data.numpages };
  } catch {
    return {
      text: `[PDF file: ${path.basename(filePath)}, ${Math.round(stat.size / 1024)}KB. For text extraction install: pnpm add pdf-parse]`,
      pages: 0,
    };
  }
}

// ============================================================
// MCP TOOL DEFINITIONS
// ============================================================

export const DOCUMENT_TOOLS = [
  {
    name: 'create_docx',
    description: 'Create a Word document (.docx) with headings, paragraphs, tables, lists, and page breaks. Output is saved to the specified directory.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Output filename (e.g. "report.docx")' },
        output_dir: { type: 'string', description: 'Directory to write the file to' },
        title: { type: 'string', description: 'Document title (optional)' },
        content: {
          type: 'array',
          description: 'Document content blocks',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['heading', 'paragraph', 'table', 'list', 'pagebreak'] },
              level: { type: 'number', description: 'Heading level 1-4 (for heading type)' },
              text: { type: 'string', description: 'Text content (for heading/paragraph)' },
              bold: { type: 'boolean', description: 'Bold text (for paragraph)' },
              italic: { type: 'boolean', description: 'Italic text (for paragraph)' },
              items: { type: 'array', items: { type: 'string' }, description: 'List items (for list type)' },
              headers: { type: 'array', items: { type: 'string' }, description: 'Table headers (for table type)' },
              rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Table rows (for table type)' },
            },
            required: ['type'],
          },
        },
      },
      required: ['filename', 'output_dir', 'content'],
    },
  },
  {
    name: 'create_pdf',
    description: 'Create a PDF document with headings, paragraphs, tables, lists, and page breaks.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Output filename (e.g. "report.pdf")' },
        output_dir: { type: 'string', description: 'Directory to write the file to' },
        title: { type: 'string', description: 'Document title (optional)' },
        content: {
          type: 'array',
          description: 'Document content blocks (same format as create_docx)',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['heading', 'paragraph', 'table', 'list', 'pagebreak'] },
              level: { type: 'number' },
              text: { type: 'string' },
              bold: { type: 'boolean' },
              italic: { type: 'boolean' },
              items: { type: 'array', items: { type: 'string' } },
              headers: { type: 'array', items: { type: 'string' } },
              rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
            },
            required: ['type'],
          },
        },
      },
      required: ['filename', 'output_dir', 'content'],
    },
  },
  {
    name: 'create_spreadsheet',
    description: 'Create an Excel spreadsheet (.xlsx) with multiple sheets, headers, data rows, and auto-filters.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Output filename (e.g. "data.xlsx")' },
        output_dir: { type: 'string', description: 'Directory to write the file to' },
        sheets: {
          type: 'array',
          description: 'Worksheet definitions',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Sheet name' },
              headers: { type: 'array', items: { type: 'string' }, description: 'Column headers' },
              rows: { type: 'array', items: { type: 'array' }, description: 'Data rows' },
            },
            required: ['name', 'headers', 'rows'],
          },
        },
      },
      required: ['filename', 'output_dir', 'sheets'],
    },
  },
  {
    name: 'read_docx',
    description: 'Extract text content from a Word document (.docx).',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the .docx file' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'read_pdf',
    description: 'Extract text content from a PDF file.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the .pdf file' },
      },
      required: ['file_path'],
    },
  },
];

/**
 * Handle document tool calls from MCP
 */
export async function handleDocumentTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'create_docx':
      return createDocx(args as unknown as CreateDocRequest);
    case 'create_pdf':
      return createPdf(args as unknown as CreateDocRequest);
    case 'create_spreadsheet':
      return createSpreadsheet(args as unknown as CreateSpreadsheetRequest);
    case 'read_docx':
      return readDocx(args.file_path as string);
    case 'read_pdf':
      return readPdf(args.file_path as string);
    default:
      return { error: `Unknown document tool: ${name}` };
  }
}
