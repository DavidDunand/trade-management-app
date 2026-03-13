export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { TradeLeg } from "@/app/(protected)/trade-tickets/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function fmtNumber(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toLocaleString("en-CH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function computeNetAmount(leg: Partial<TradeLeg>): number {
  const price = leg.clientPrice ?? 0;
  if (leg.settlementType === "units") {
    return (leg.numberOfUnits ?? 0) * price;
  }
  return ((leg.notional ?? 0) * price) / 100;
}

// ─── Valeur logo helper ───────────────────────────────────────────────────────
// Reads app/icon.svg, inverts the fill colour to white, and rasterises to PNG
// via sharp so it can be embedded in DOCX (ImageRun) and PDF (pdfkit .image()).

async function getValeurLogoWhitePng(heightPx: number): Promise<Buffer> {
  const { readFileSync } = await import("fs");
  const { join } = await import("path");
  const sharp = (await import("sharp")).default;
  const svgPath = join(process.cwd(), "app", "icon.svg");
  const whiteSvg = readFileSync(svgPath, "utf-8").replace(/#1e3052/gi, "#ffffff");
  return sharp(Buffer.from(whiteSvg)).resize({ height: heightPx }).png().toBuffer();
}

// ─── Fetch full leg data from DB ──────────────────────────────────────────────

async function fetchLegData(legId: string): Promise<TradeLeg | null> {
  const { data, error } = await supabase
    .from("trade_legs")
    .select(
      `
      id,
      trade_id,
      leg,
      size,
      counterparty_id,
      counterparty:counterparty_id(legal_name, ssi),
      trade:trade_id(
        reference,
        trade_date,
        value_date,
        buy_price,
        sell_price,
        client_name,
        client_contact:client_contact_id(
          id,
          advisor_id,
          first_name,
          family_name
        ),
        booking_entity:booking_entity_id(legal_name, entity_type, ssi),
        distributing_entity:distributing_entity_id(id, legal_name, entity_type, ssi, short_name),
        product:product_id(isin, product_name, currency, settlement)
      )
    `
    )
    .eq("id", legId)
    .single();

  if (error || !data) return null;
  const r = data as any;
  const t = r.trade;
  const p = t?.product;
  const bookingEntity: string = t?.booking_entity?.legal_name ?? "-";
  const distributingEntity: string = t?.distributing_entity?.legal_name ?? "-";
  const distributingEntityType: string = t?.distributing_entity?.entity_type ?? "other";
  const isDistValeur = distributingEntityType === "valeur";
  const direction: "buy" | "sell" = r.leg === "buy" ? "buy" : "sell";
  const clientPrice = direction === "sell" ? (t?.sell_price ?? undefined) : (t?.buy_price ?? undefined);
  const size: number = r.size ?? 0;

  const partial: Partial<TradeLeg> = {
    settlementType: p?.settlement ?? "percent",
    clientPrice,
  };
  if (partial.settlementType === "units") {
    partial.numberOfUnits = size;
  } else {
    partial.notional = size;
  }

  // For RiverRock: fetch the opposite-direction leg's counterparty SSI (the actual dealer)
  let dealerSSI: string | undefined = undefined;
  if (!isDistValeur) {
    const dealerDirection = direction === "sell" ? "buy" : "sell";
    const { data: dealerLegData } = await supabase
      .from("trade_legs")
      .select("counterparty:counterparty_id(ssi)")
      .eq("trade_id", r.trade_id)
      .eq("leg", dealerDirection)
      .limit(1)
      .maybeSingle();
    dealerSSI = (dealerLegData as any)?.counterparty?.ssi ?? undefined;
  }

  // Fetch dealer contacts from group_entity_contacts
  const { data: entityContactRows } = await supabase
    .from("group_entity_contacts")
    .select("email")
    .eq("group_entity_id", t?.distributing_entity?.id ?? "")
    .not("email", "is", null);
  const dealerContacts = (entityContactRows ?? [])
    .map((c: any) => c.email as string)
    .filter(Boolean)
    .join(" | ");

  // Resolve clientId: prefer the contact's advisor_id, fall back to advisor lookup by client_name
  let clientId: string = t?.client_contact?.advisor_id ?? "";
  if (!clientId && t?.client_name) {
    const { data: advisorRow } = await supabase
      .from("advisors")
      .select("id")
      .eq("legal_name", t.client_name)
      .maybeSingle();
    clientId = (advisorRow as any)?.id ?? "";
  }

  return {
    id: r.id,
    tradeRef: t?.reference ?? "-",
    isin: p?.isin ?? "-",
    productName: p?.product_name ?? "-",
    direction,
    tradeDate: t?.trade_date ?? "",
    valueDate: t?.value_date ?? "",
    currency: p?.currency ?? "EUR",
    settlementType: partial.settlementType!,
    notional: partial.notional,
    numberOfUnits: partial.numberOfUnits,
    clientPrice,
    netAmount: computeNetAmount(partial),
    clientName: t?.client_name ?? "-",
    bookingEntity,
    distributingEntity,
    dealerLegalName: t?.distributing_entity?.legal_name ?? "-",
    // Valeur: SSI from group_entities.ssi (fallback "Euroclear 41420"). RiverRock: opposite-direction leg's counterparty SSI
    dealerSSI: isDistValeur ? (t?.distributing_entity?.ssi ?? "Euroclear 41420") : dealerSSI,
    counterpartyLegalName: r.counterparty?.legal_name ?? "-",
    counterpartySSI: r.counterparty?.ssi ?? undefined,
    counterpartyId: r.counterparty_id ?? undefined,
    clientId,
    distributingEntityType,
    dealerSsi: t?.distributing_entity?.ssi ?? undefined,
    dealerContacts: dealerContacts || undefined,
    dealerShortName: t?.distributing_entity?.short_name ?? undefined,
  };
}

// ─── Fetch contact ────────────────────────────────────────────────────────────

async function fetchContact(contactId: string) {
  const { data, error } = await supabase
    .from("advisor_contacts")
    .select("id, first_name, family_name, email")
    .eq("id", contactId)
    .single();
  if (error || !data) return null;
  const d = data as any;
  return {
    id: d.id as string,
    name: `${d.first_name} ${d.family_name}`,
    email: (d.email as string | null) ?? "",
  };
}

// ─── Fetch custodian contact (from counterparty_contacts) ─────────────────────

async function fetchCustodianContact(contactId: string) {
  const { data, error } = await supabase
    .from("counterparty_contacts")
    .select("id, first_name, family_name, email")
    .eq("id", contactId)
    .single();
  if (error || !data) return null;
  const d = data as any;
  return {
    id: d.id as string,
    name: `${d.first_name} ${d.family_name}`,
    email: (d.email as string | null) ?? "",
  };
}

// ─── Fetch current user profile ───────────────────────────────────────────────

async function fetchUser(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .single();
  const d = data as any;
  return {
    name: d?.full_name ?? "Unknown",
    email: d?.email ?? "",
  };
}

// ─── Log ticket to DB ─────────────────────────────────────────────────────────

async function logTicket(legId: string, contactId: string, format: string, userId: string) {
  await supabase.from("trade_tickets").insert({
    leg_id: legId,
    contact_id: contactId,
    format,
    generated_by: userId,
  });
}

// ─── DOCX generation ──────────────────────────────────────────────────────────

async function generateDocx(leg: TradeLeg, contact: { id: string; name: string; email: string }, user: { name: string; email: string }, custodianContactEmail: string): Promise<Buffer> {
  const {
    Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  } = await import("docx");

  const isValeur = leg.distributingEntityType === "valeur";

  // For Valeur: rasterise the logo SVG to a white-path PNG for embedding
  const valeurLogoPng = isValeur ? await getValeurLogoWhitePng(60) : null;
  const isClientBuy = leg.direction === "sell"; // dealer sells → CLIENT BUY

  // Colours
  const DARK_NAVY = "1A2A4A";
  const ACCENT_BLUE = "2E5FA3";
  const LIGHT_BLUE = "EBF0F8";
  const MUTED = "6B7280";
  const WHITE = "FFFFFF";

  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" };
  const thinBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  const PAGE_W = 11906; // A4
  const MARGIN = 720;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  function headerBar(text: string) {
    return new TableRow({
      children: [
        new TableCell({
          columnSpan: 2,
          borders: noBorders,
          shading: { fill: DARK_NAVY, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 160, right: 160 },
          children: [
            new Paragraph({
              children: [new TextRun({ text, color: WHITE, bold: true, size: 22, font: "Calibri" })],
            }),
          ],
        }),
      ],
    });
  }

  function dataRow(label: string, value: string, isNetAmount = false) {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: CONTENT_W / 2, type: WidthType.DXA },
          borders: thinBorders,
          shading: { fill: isNetAmount ? ACCENT_BLUE : "F9FAFB", type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: label, color: isNetAmount ? WHITE : MUTED, size: 18, font: "Calibri" }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: CONTENT_W / 2, type: WidthType.DXA },
          borders: thinBorders,
          shading: { fill: isNetAmount ? LIGHT_BLUE : WHITE, type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: value, color: isNetAmount ? ACCENT_BLUE : "1F2937", size: 18, bold: isNetAmount, font: "Calibri" }),
              ],
            }),
          ],
        }),
      ],
    });
  }

  // Size/price labels
  const sizeLabel = leg.settlementType === "units" ? "Number of Units" : "Notional";
  const priceLabel = leg.settlementType === "units" ? "Price per Unit" : "Price (%)";
  const sizeValue =
    leg.settlementType === "units"
      ? `${fmtNumber(leg.numberOfUnits, 0)} units`
      : `${leg.currency} ${fmtNumber(leg.notional)}`;
  const priceValue =
    leg.settlementType === "units"
      ? `${leg.currency} ${fmtNumber(leg.clientPrice)} per unit`
      : `${fmtNumber(leg.clientPrice)}%`;
  const netAmountValue = `${leg.currency} ${fmtNumber(leg.netAmount)}`;

  // Direction badge text
  const directionText = isClientBuy ? "YOU BUY" : "YOU SELL";

  // Buyer / Seller blocks
  const dealerBlock = {
    legalName: leg.dealerLegalName,
    ssi: leg.dealerSsi ?? leg.dealerSSI ?? "-",
    contact: isValeur
      ? (leg.dealerContacts ?? "")
      : `${user.name} \u00B7 ${user.email}`,
  };
  const clientBlock = {
    legalName: leg.counterpartyLegalName,
    ssi: leg.counterpartySSI ?? "-",
    contact: custodianContactEmail,
  };

  const buyerBlock = isClientBuy ? clientBlock : dealerBlock;
  const sellerBlock = isClientBuy ? dealerBlock : clientBlock;

  // Entity label
  const entityLabel = leg.dealerShortName ?? leg.dealerLegalName.toUpperCase();
  const footerText = `This document has been produced by ${leg.dealerLegalName}`;

  function ssiBlock(title: string, block: { legalName: string; ssi: string; contact: string }) {
    return [
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            borders: noBorders,
            shading: { fill: DARK_NAVY, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: title, color: WHITE, bold: true, size: 22, font: "Calibri" })],
              }),
            ],
          }),
        ],
      }),
      dataRow("Legal Name", block.legalName),
      dataRow("Account / SSI", block.ssi),
      dataRow("Contact", block.contact),
    ];
  }

  // Header table: entity name left, ISIN+product right
  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W / 2, CONTENT_W / 2],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_W / 2, type: WidthType.DXA },
            borders: noBorders,
            shading: { fill: DARK_NAVY, type: ShadingType.CLEAR },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 150, bottom: 150, left: 200, right: 100 },
            children: [
              new Paragraph({
                children: isValeur && valeurLogoPng
                  ? [new ImageRun({ data: valeurLogoPng, transformation: { width: 46, height: 53 }, type: "png" })]
                  : [
                      new TextRun({ text: "RIVERROCK", color: WHITE, bold: true, size: 28, font: "Calibri" }),
                      new TextRun({ text: " SECURITIES SAS", color: "A8B9D4", bold: false, size: 28, font: "Calibri" }),
                    ],
              }),
              new Paragraph({
                children: [new TextRun({ text: "Trade Confirmation", color: "A8B9D4", size: 18, font: "Calibri" })],
              }),
            ],
          }),
          new TableCell({
            width: { size: CONTENT_W / 2, type: WidthType.DXA },
            borders: noBorders,
            shading: { fill: DARK_NAVY, type: ShadingType.CLEAR },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 120, bottom: 120, left: 100, right: 200 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: leg.isin, color: WHITE, bold: true, size: 22, font: "Calibri" })],
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: leg.productName, color: "A8B9D4", italics: true, size: 18, font: "Calibri" })],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // Direction badge row
  const badgeBg = isClientBuy ? "D1FAE5" : "FEE2E2";
  const badgeFg = isClientBuy ? "065F46" : "991B1B";
  const directionTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            shading: { fill: badgeBg, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: directionText, color: badgeFg, bold: true, size: 22, font: "Calibri" })],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // Client info table
  const clientInfoTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W / 2, CONTENT_W / 2],
    rows: [
      dataRow("Client Name", leg.clientName),
      dataRow("Contact", contact.name),
      dataRow("Email", contact.email),
    ],
  });

  // Trade economics table
  const tradeEconTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W / 2, CONTENT_W / 2],
    rows: [
      headerBar("Trade Economics"),
      dataRow("Trade Date", fmtDate(leg.tradeDate)),
      dataRow("Value / Settlement Date", fmtDate(leg.valueDate)),
      dataRow("Currency", leg.currency),
      dataRow(sizeLabel, sizeValue),
      dataRow(priceLabel, priceValue),
      dataRow("Net Amount", netAmountValue, true),
    ],
  });

  // Settlement table
  const settlementTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W / 2, CONTENT_W / 2],
    rows: [
      headerBar("Settlement Instructions"),
      ...ssiBlock("BUYER", buyerBlock),
      ...ssiBlock("SELLER", sellerBlock),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: 16838 },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children: [
          headerTable,
          new Paragraph({ children: [], spacing: { after: 120 } }),
          clientInfoTable,
          new Paragraph({ children: [], spacing: { after: 120 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: directionText, color: badgeFg, bold: true, size: 22, font: "Calibri" })],
          }),
          new Paragraph({ children: [], spacing: { after: 120 } }),
          tradeEconTable,
          new Paragraph({ children: [], spacing: { after: 120 } }),
          settlementTable,
          new Paragraph({ children: [], spacing: { after: 240 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: footerText, color: MUTED, size: 16, italics: true, font: "Calibri" })],
          }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

// ─── PDF generation (pdfkit) ──────────────────────────────────────────────────

async function generatePdf(leg: TradeLeg, contact: { id: string; name: string; email: string }, user: { name: string; email: string }, custodianContactEmail: string): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;

  const isValeur = leg.distributingEntityType === "valeur";
  const isClientBuy = leg.direction === "sell";

  // For Valeur: rasterise the logo SVG to a white-path PNG for embedding
  const valeurLogoPng = isValeur ? await getValeurLogoWhitePng(100) : null;

  const DARK_NAVY: [number, number, number] = [26, 42, 74];
  const ACCENT_BLUE: [number, number, number] = [46, 95, 163];
  const LIGHT_BLUE: [number, number, number] = [235, 240, 248];
  const MUTED: [number, number, number] = [107, 114, 128];
  const WHITE: [number, number, number] = [255, 255, 255];
  const LIGHT_GREY: [number, number, number] = [249, 250, 251];
  const BORDER: [number, number, number] = [209, 213, 219];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PAGE_W = 595.28;
    const MARGIN = 40;
    const COL_W = (PAGE_W - MARGIN * 2) / 2;
    const FULL_W = PAGE_W - MARGIN * 2;

    // Header — height 70 (≈17% taller than before) to accommodate logo
    const HEADER_H = isValeur ? 70 : 60;
    doc.rect(MARGIN, MARGIN, FULL_W, HEADER_H).fill(rgb(DARK_NAVY));
    if (isValeur && valeurLogoPng) {
      // Logo: aspect ratio 1333×1533 ≈ 0.87 width/height → at height 46pt, width ≈ 40pt
      doc.image(valeurLogoPng, MARGIN + 10, MARGIN + 8, { height: 46 });
      doc.fontSize(9).fillColor([168, 185, 212]).text("Trade Confirmation", MARGIN + 10, MARGIN + 57);
    } else {
      doc.fontSize(14).fillColor(WHITE);
      doc.text("RIVERROCK", MARGIN + 10, MARGIN + 10, { continued: true }).fillColor([168, 185, 212]).text(" SECURITIES SAS");
      doc.fontSize(9).fillColor([168, 185, 212]).text("Trade Confirmation", MARGIN + 10, MARGIN + 28);
    }
    doc.fontSize(11).fillColor(WHITE).text(leg.isin, MARGIN, MARGIN + 10, { width: FULL_W - 10, align: "right" });
    doc.fontSize(9).fillColor([168, 185, 212]).text(leg.productName, MARGIN, MARGIN + 28, { width: FULL_W - 10, align: "right" });

    let y = MARGIN + HEADER_H + 15;

    // Client info
    function drawDataRow(label: string, value: string, rowY: number, isAccent = false) {
      if (isAccent) {
        doc.rect(MARGIN, rowY, COL_W, 20).fill(rgb(ACCENT_BLUE));
        doc.rect(MARGIN + COL_W, rowY, COL_W, 20).fill(rgb(LIGHT_BLUE));
        doc.fontSize(9).fillColor(WHITE).text(label, MARGIN + 5, rowY + 6, { width: COL_W - 10 });
        doc.fillColor(ACCENT_BLUE).text(value, MARGIN + COL_W + 5, rowY + 6, { width: COL_W - 10 });
      } else {
        doc.rect(MARGIN, rowY, COL_W, 20).fill(rgb(LIGHT_GREY)).stroke(rgb(BORDER));
        doc.rect(MARGIN + COL_W, rowY, COL_W, 20).fill(rgb(WHITE)).stroke(rgb(BORDER));
        doc.fontSize(9).fillColor(MUTED).text(label, MARGIN + 5, rowY + 6, { width: COL_W - 10 });
        doc.fillColor([31, 41, 55]).text(value, MARGIN + COL_W + 5, rowY + 6, { width: COL_W - 10 });
      }
    }

    function drawSectionBar(title: string, barY: number) {
      doc.rect(MARGIN, barY, FULL_W, 22).fill(rgb(DARK_NAVY));
      doc.fontSize(9).fillColor(WHITE).text(title, MARGIN + 8, barY + 7);
    }

    drawDataRow("Client Name", leg.clientName, y); y += 22;
    drawDataRow("Contact", contact.name, y); y += 22;
    drawDataRow("Email", contact.email, y); y += 30;

    // Direction badge
    const badgeBg: [number, number, number] = isClientBuy ? [209, 250, 229] : [254, 226, 226];
    const badgeFg: [number, number, number] = isClientBuy ? [6, 95, 70] : [153, 27, 27];
    const dirText = isClientBuy ? "YOU BUY" : "YOU SELL";
    doc.rect(MARGIN, y, FULL_W, 22).fill(rgb(badgeBg));
    doc.fontSize(10).fillColor(badgeFg).text(dirText, MARGIN, y + 7, { width: FULL_W, align: "center" });
    y += 32;

    // Trade economics
    const sizeLabel = leg.settlementType === "units" ? "Number of Units" : "Notional";
    const priceLabel = leg.settlementType === "units" ? "Price per Unit" : "Price (%)";
    const sizeValue = leg.settlementType === "units"
      ? `${fmtNumber(leg.numberOfUnits, 0)} units`
      : `${leg.currency} ${fmtNumber(leg.notional)}`;
    const priceValue = leg.settlementType === "units"
      ? `${leg.currency} ${fmtNumber(leg.clientPrice)} per unit`
      : `${fmtNumber(leg.clientPrice)}%`;

    drawSectionBar("Trade Economics", y); y += 24;
    drawDataRow("Trade Date", fmtDate(leg.tradeDate), y); y += 22;
    drawDataRow("Value / Settlement Date", fmtDate(leg.valueDate), y); y += 22;
    drawDataRow("Currency", leg.currency, y); y += 22;
    drawDataRow(sizeLabel, sizeValue, y); y += 22;
    drawDataRow(priceLabel, priceValue, y); y += 22;
    drawDataRow("Net Amount", `${leg.currency} ${fmtNumber(leg.netAmount)}`, y, true); y += 30;

    // Settlement
    const dealerBlock = {
      legalName: leg.dealerLegalName,
      ssi: leg.dealerSsi ?? leg.dealerSSI ?? "-",
      contact: isValeur ? (leg.dealerContacts ?? "") : `${user.name} \u00B7 ${user.email}`,
    };
    const clientBlock = {
      legalName: leg.counterpartyLegalName,
      ssi: leg.counterpartySSI ?? "-",
      contact: custodianContactEmail,
    };
    const buyerBlock = isClientBuy ? clientBlock : dealerBlock;
    const sellerBlock = isClientBuy ? dealerBlock : clientBlock;

    drawSectionBar("Settlement Instructions", y); y += 24;
    drawSectionBar("BUYER", y); y += 24;
    drawDataRow("Legal Name", buyerBlock.legalName, y); y += 22;
    drawDataRow("Account / SSI", buyerBlock.ssi, y); y += 22;
    drawDataRow("Contact", buyerBlock.contact, y); y += 30;
    drawSectionBar("SELLER", y); y += 24;
    drawDataRow("Legal Name", sellerBlock.legalName, y); y += 22;
    drawDataRow("Account / SSI", sellerBlock.ssi, y); y += 22;
    drawDataRow("Contact", sellerBlock.contact, y); y += 30;

    // Footer
    const footerText = `This document has been produced by ${leg.dealerLegalName}`;
    doc.fontSize(8).fillColor(MUTED).text(footerText, MARGIN, y, { width: FULL_W, align: "center" });

    doc.end();
  });
}

function rgb(c: [number, number, number]): string {
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");

  let userId: string | null = null;
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    userId = data.user?.id ?? null;
  }

  const body = await req.json().catch(() => ({}));
  const { legId, contactId, custodianContactId, format, logOnly } = body as {
    legId?: string;
    contactId?: string;
    custodianContactId?: string | null;
    format?: string;
    logOnly?: boolean;
  };

  if (!legId || !contactId || !format) {
    return NextResponse.json({ error: "legId, contactId and format are required" }, { status: 400 });
  }

  // logOnly = true is used for PNG: the file is generated client-side, but we still log to DB
  if (logOnly) {
    if (userId) await logTicket(legId, contactId, format, userId).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (!["docx", "pdf"].includes(format)) {
    return NextResponse.json({ error: "Unsupported format. Use docx or pdf." }, { status: 400 });
  }

  const [leg, contact, custodianContact, user] = await Promise.all([
    fetchLegData(legId),
    fetchContact(contactId),
    custodianContactId ? fetchCustodianContact(custodianContactId) : Promise.resolve(null),
    userId ? fetchUser(userId) : Promise.resolve({ name: "Unknown", email: "" }),
  ]);

  if (!leg) return NextResponse.json({ error: "Leg not found" }, { status: 404 });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  let fileBuffer: Buffer;
  let contentType: string;
  let filename: string;

  const ref = leg.tradeRef.replace(/[^a-zA-Z0-9-]/g, "_");

  const custodianEmail = custodianContact?.email ?? "";

  if (format === "docx") {
    fileBuffer = await generateDocx(leg, contact, user, custodianEmail);
    contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    filename = `TradeTicket_${ref}.docx`;
  } else {
    fileBuffer = await generatePdf(leg, contact, user, custodianEmail);
    contentType = "application/pdf";
    filename = `TradeTicket_${ref}.pdf`;
  }

  // Log to DB (non-blocking, best effort)
  if (userId) {
    logTicket(legId, contactId, format, userId).catch(() => {});
  }

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(fileBuffer.length),
    },
  });
}
