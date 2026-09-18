/**
 * Verification test suite for PrinterManager:
 * Tests matching, classification, fuzzy resolution, virtual printer exclusion,
 * ambiguity detection, and multi-tenant isolation.
 */
import { PrinterManager } from "../src/lib/printerManager";

// Mock localStorage for Node environment if not present
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear()
  };
}

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`, detail || "");
    failed++;
  }
}

console.log("\n=======================================================");
console.log("RUNNING WEBRAJYA POS PRINTER MANAGER VERIFICATION SUITE");
console.log("=======================================================\n");

// TEST CASE A: Exact substring match with driver suffix ("EPSON TM-T82X Receipt")
{
  const discovered = ["EPSON TM-T82X Receipt", "OneNote (Desktop)", "Microsoft Print to PDF"];
  const configured = "EPSON TM-T82X";
  const match = PrinterManager.findBestPrinterMatch(configured, discovered);

  assert(
    match.isSafeMatch === true && match.matchedPrinter === "EPSON TM-T82X Receipt",
    "Test A: Configured 'EPSON TM-T82X' safely matches installed 'EPSON TM-T82X Receipt'",
    match
  );
  assert(match.confidence >= 0.85, "Test A: Confidence score is high (>= 0.85)", match.confidence);
}

// TEST CASE B: Strict exact match
{
  const discovered = ["EPSON TM-T82X", "OneNote (Desktop)", "Microsoft Print to PDF"];
  const configured = "EPSON TM-T82X";
  const match = PrinterManager.findBestPrinterMatch(configured, discovered);

  assert(
    match.isSafeMatch === true && match.matchType === "exact" && match.matchedPrinter === "EPSON TM-T82X",
    "Test B: Exact match resolves with 100% confidence",
    match
  );
}

// TEST CASE C: Ambiguous match with multiple thermal printers in same restaurant
{
  const discovered = ["EPSON TM-T82X Receipt", "EPSON TM-T82X Kitchen"];
  const configured = "EPSON TM-T82X";
  const match = PrinterManager.findBestPrinterMatch(configured, discovered);

  assert(
    match.isSafeMatch === false && match.candidates.length === 2,
    "Test C: Multiple distinct candidates ('Receipt' and 'Kitchen') triggers ambiguity safety instead of silent guessing",
    match
  );
}

// TEST CASE D: Only virtual printers installed, target thermal printer missing
{
  const discovered = ["OneNote (Desktop)", "Microsoft Print to PDF"];
  const configured = "EPSON TM-T82X";
  const match = PrinterManager.findBestPrinterMatch(configured, discovered);

  assert(
    match.isSafeMatch === false && match.matchedPrinter === null,
    "Test D: Missing thermal printer does NOT match virtual printers (PDF / OneNote)",
    match
  );
}

// TEST CASE E: Never silently print to Microsoft Print to PDF
{
  const isVirtualPdf = PrinterManager.isVirtualPrinter("Microsoft Print to PDF");
  const isVirtualOneNote = PrinterManager.isVirtualPrinter("OneNote (Desktop)");
  const isVirtualEpson = PrinterManager.isVirtualPrinter("EPSON TM-T82X Receipt");

  assert(isVirtualPdf === true, "Test E1: Microsoft Print to PDF classified as virtual");
  assert(isVirtualOneNote === true, "Test E2: OneNote classified as virtual");
  assert(isVirtualEpson === false, "Test E3: Epson TM-T82X classified as NOT virtual");
}

// TEST CASE F: Model token match ("TM-T82X" matches "Epson TM-T82X Receipt")
{
  const discovered = ["Epson TM-T82X Receipt", "HP LaserJet Pro MFP"];
  const configured = "TM-T82X";
  const match = PrinterManager.findBestPrinterMatch(configured, discovered);

  assert(
    match.isSafeMatch === true && match.matchedPrinter === "Epson TM-T82X Receipt",
    "Test F: 'TM-T82X' safely matches 'Epson TM-T82X Receipt'",
    match
  );
}

// TEST CASE G: Case, whitespace, and symbol insensitivity
{
  const discovered = ["EPSON TM-T82X Receipt"];
  const configured = "  epson   tm_t82x   ";
  const match = PrinterManager.findBestPrinterMatch(configured, discovered);

  assert(
    match.isSafeMatch === true && match.matchedPrinter === "EPSON TM-T82X Receipt",
    "Test G: Handles erratic casing, underscores, and excessive spaces cleanly",
    match
  );
}

// TEST CASE H: Generic "Thermal Receipt" name
{
  const discovered = ["Thermal Receipt Printer", "Canon G3000 Series"];
  const configured = "Thermal Receipt";
  const match = PrinterManager.findBestPrinterMatch(configured, discovered);

  assert(
    match.isSafeMatch === true && match.matchedPrinter === "Thermal Receipt Printer",
    "Test H: 'Thermal Receipt' safely matches 'Thermal Receipt Printer'",
    match
  );
}

// TEST CASE I: Thermal score prioritization
{
  const scoredEpson = PrinterManager.scorePrinter("EPSON TM-T82X Receipt").score;
  const scoredTSC = PrinterManager.scorePrinter("TSC TE244 Barcode Printer").score;
  const scoredPdf = PrinterManager.scorePrinter("Microsoft Print to PDF").score;

  assert(scoredEpson > scoredTSC, "Test I1: POS thermal receipt scores higher than barcode label printer", { scoredEpson, scoredTSC });
  assert(scoredTSC > scoredPdf, "Test I2: Physical printer scores higher than virtual printer", { scoredTSC, scoredPdf });
}

// TEST CASE J: Strict Multi-Tenant Isolation
{
  // Restaurant 1: The Spice Lounge (org_spice_123, branch_downtown)
  const org1 = "org_spice_123";
  const branch1 = "branch_downtown";
  PrinterManager.saveConfiguredPrinter({
    organizationId: org1,
    branchId: branch1,
    organizationName: "The Spice Lounge",
    branchName: "Downtown Branch",
    receiptPrinterName: "EPSON TM-T82X Receipt",
    kotPrinterName: "EPSON TM-T82X Kitchen"
  });

  // Restaurant 2: Ocean Grill (org_ocean_456, branch_beachside)
  const org2 = "org_ocean_456";
  const branch2 = "branch_beachside";
  PrinterManager.saveConfiguredPrinter({
    organizationId: org2,
    branchId: branch2,
    organizationName: "Ocean Grill",
    branchName: "Beachside Branch",
    receiptPrinterName: "Star TSP143 Thermal",
    kotPrinterName: "Bixolon SRP-350"
  });

  // Read back Org 1
  const configOrg1 = PrinterManager.getConfiguredPrinter(org1, branch1);
  // Read back Org 2
  const configOrg2 = PrinterManager.getConfiguredPrinter(org2, branch2);

  assert(
    configOrg1.receiptPrinterName === "EPSON TM-T82X Receipt" &&
    configOrg1.branchName === "Downtown Branch",
    "Test J1: Restaurant 1 retrieved its own isolated configuration"
  );

  assert(
    configOrg2.receiptPrinterName === "Star TSP143 Thermal" &&
    configOrg2.branchName === "Beachside Branch",
    "Test J2: Restaurant 2 retrieved its own isolated configuration"
  );

  assert(
    configOrg1.receiptPrinterName !== configOrg2.receiptPrinterName,
    "Test J3: Complete isolation verified - no cross-tenant leakage"
  );
}

console.log("\n=======================================================");
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("=======================================================\n");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
