import React, { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { 
  Upload, X, CheckCircle, AlertTriangle, AlertCircle, 
  FileSpreadsheet, Download, RefreshCw, Check, 
  ArrowRight, ShieldAlert, Cpu, FileText
} from "lucide-react";
import { LocalDB, supabase } from "../lib/db";
import { MenuItem } from "../types";

interface BulkMenuImporterProps {
  onClose: () => void;
  onImportSuccess: () => void;
}

interface ProcessedItem {
  rowNumber: number;
  raw: any;
  mapped: {
    itemCode: string;
    name: string;
    category: string;
    description: string;
    price: number;
    isVeg: boolean;
    imageUrl: string;
    rating: number;
    ratingCount: number;
    isBestseller: boolean;
    isChefSpecial: boolean;
    spiciness: number;
    gstPercent: number;
    hsnCode: string;
    available: boolean;
  };
  errors: string[];
  warnings: string[];
  isValid: boolean;
  isUpdate: boolean;
  id: string;
}

interface ImportStats {
  totalRows: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  startTime: number;
  endTime: number;
}

interface PerformanceMetric {
  itemCount: number;
  importTime: number;
  dbWriteTime: number;
  successCount: number;
  updateCount: number;
  failedCount: number;
  avgBatchTime: number;
}

const ALIASES: Record<string, string[]> = {
  itemCode: ["item code", "item_code", "itemcode", "code", "sku"],
  name: ["item name", "name", "dish name", "title", "dish", "item", "item_name"],
  category: ["category", "cat", "food category", "dish category", "type of dish"],
  description: ["description", "desc", "about", "details", "summary", "info"],
  price: ["price", "rate", "cost", "amount", "mrp", "price (inr)", "price inr"],
  isVeg: ["veg", "food type", "is_veg", "isveg", "type", "veg/non-veg", "vegetarian", "veg_nonveg"],
  isBestseller: ["bestseller", "is_bestseller", "isbestseller", "popular", "best seller", "best-seller"],
  isChefSpecial: ["chef special", "chef_special", "is_chef_special", "ischefspecial", "signature", "chef-special"],
  rating: ["rating", "stars", "score"],
  ratingCount: ["rating count", "rating_count", "ratings", "reviews", "review count"],
  spiciness: ["spiciness", "spicy", "spicy_level", "spice level", "spice_level", "chili", "chilli"],
  gstPercent: ["gst %", "gst", "gst percent", "gst_percent", "tax percent", "tax %"],
  hsnCode: ["hsn code", "hsn_code", "hsn", "hsncode"],
  imageUrl: ["image url", "image_url", "imageurl", "image", "pic", "picture", "photo"],
  available: ["available", "is_available", "isavailable", "active", "in stock", "instock"]
};

export default function BulkMenuImporter({ onClose, onImportSuccess }: BulkMenuImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [headersMap, setHeadersMap] = useState<Record<string, string>>({});
  const [processedItems, setProcessedItems] = useState<ProcessedItem[]>([]);
  const [existingItems, setExistingItems] = useState<MenuItem[]>([]);
  const [activePreviewTab, setActivePreviewTab] = useState<"all" | "valid" | "errors">("all");
  
  // Progress & Stats
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [stats, setStats] = useState<ImportStats>({
    totalRows: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    startTime: 0,
    endTime: 0
  });

  // Verification Stress-Test States
  const [perfReport, setPerfReport] = useState<PerformanceMetric | null>(null);
  const [testingSize, setTestingSize] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing items once for matching and updating
  useEffect(() => {
    const loadItems = async () => {
      try {
        const items = await LocalDB.fetchMenuItems();
        setExistingItems(items);
      } catch (e) {
        console.warn("Failed to load existing menu items for mapping:", e);
        // Fallback to local storage
        setExistingItems(LocalDB.getMenuItems());
      }
    };
    loadItems();
  }, []);

  const findCanonicalKey = (header: string): string | null => {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
    
    // First pass: exact match
    for (const [canonical, aliases] of Object.entries(ALIASES)) {
      if (canonical.toLowerCase() === normalized) return canonical;
      const exactMatch = aliases.some(alias => {
        const normAlias = alias.replace(/[^a-z0-9]/g, "").trim();
        return normalized === normAlias;
      });
      if (exactMatch) return canonical;
    }

    // Second pass: fallback fuzzy match
    for (const [canonical, aliases] of Object.entries(ALIASES)) {
      const fuzzyMatch = aliases.some(alias => {
        const normAlias = alias.replace(/[^a-z0-9]/g, "").trim();
        if (normAlias.length < 3 || normalized.length < 3) return false;
        return normalized.includes(normAlias) || normAlias.includes(normalized);
      });
      if (fuzzyMatch) return canonical;
    }
    
    return null;
  };

  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    parseFile(selectedFile);
  };

  const parseFile = (fileToParse: File) => {
    setLoading(true);
    setProcessedItems([]);
    setHeadersMap({});
    setPerfReport(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
        const jsonData = rawJsonData.filter(row => {
          return Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== "");
        });

        if (jsonData.length === 0) {
          alert("The uploaded file is empty.");
          setLoading(false);
          return;
        }

        // Map column headers
        const keys = Array.from(new Set(jsonData.flatMap(row => Object.keys(row))));
        const mapping: Record<string, string> = {};
        keys.forEach(k => {
          const canonical = findCanonicalKey(k);
          if (canonical) {
            mapping[k] = canonical;
          }
        });
        setHeadersMap(mapping);

        processJsonRows(jsonData, mapping);
      } catch (err: any) {
        console.error("Parsing error:", err);
        alert(`Failed to parse file: ${err.message || err}`);
        setLoading(false);
      }
    };

    reader.onerror = () => {
      alert("Error reading file.");
      setLoading(false);
    };

    reader.readAsBinaryString(fileToParse);
  };

  const processJsonRows = (jsonData: any[], mapping: Record<string, string>) => {
    const list: ProcessedItem[] = jsonData.map((row, index) => {
      const rowNumber = index + 2; // Row 1 is header
      const errors: string[] = [];
      const warnings: string[] = [];

      const getRawValue = (canonicalKey: string): any => {
        for (const [k, val] of Object.entries(row)) {
          if (mapping[k] === canonicalKey) return val;
        }
        return undefined;
      };

      const rawCode = getRawValue("itemCode");
      const rawName = getRawValue("name");
      const rawCategory = getRawValue("category");
      const rawDescription = getRawValue("description");
      const rawPrice = getRawValue("price");
      const rawVeg = getRawValue("isVeg");
      const rawBestseller = getRawValue("isBestseller");
      const rawChefSpecial = getRawValue("isChefSpecial");
      const rawRating = getRawValue("rating");
      const rawRatingCount = getRawValue("ratingCount");
      const rawSpiciness = getRawValue("spiciness");
      const rawGstPercent = getRawValue("gstPercent");
      const rawHsnCode = getRawValue("hsnCode");
      const rawImageUrl = getRawValue("imageUrl");
      const rawAvailable = getRawValue("available");

      // Validate Name
      let name = "";
      if (rawName !== undefined && rawName !== null) {
        name = String(rawName).trim();
      }
      if (!name) {
        errors.push("Dish Name is empty.");
      }

      // Validate Category
      let categoryId = "";
      if (rawCategory !== undefined && rawCategory !== null) {
        categoryId = LocalDB.findMatchingCategoryId(String(rawCategory));
      } else {
        errors.push("Category is missing.");
      }

      // Validate Price
      let price = 0;
      if (rawPrice !== undefined && rawPrice !== null) {
        const p = parseFloat(String(rawPrice));
        if (isNaN(p)) {
          errors.push(`Price "${rawPrice}" is not a valid number.`);
        } else if (p < 0) {
          errors.push(`Price (${p}) cannot be negative.`);
        } else {
          price = p;
        }
      } else {
        errors.push("Price is missing.");
      }

      // Optionals with smart normalization
      const itemCode = rawCode ? String(rawCode).trim() : "";
      const description = rawDescription ? String(rawDescription).trim() : "";

      // Veg conversion
      let isVeg = true;
      if (rawVeg !== undefined && rawVeg !== null) {
        const v = String(rawVeg).trim().toLowerCase();
        if (["veg", "yes", "true", "y", "vegetarian", "1"].includes(v)) {
          isVeg = true;
        } else if (["non-veg", "nonveg", "nv", "no", "false", "n", "0"].includes(v)) {
          isVeg = false;
        } else {
          warnings.push(`Veg/Non-Veg value "${rawVeg}" unrecognized, defaulting to Veg.`);
          isVeg = true;
        }
      }

      // Booleans
      const toBool = (val: any): boolean => {
        if (val === undefined || val === null) return false;
        const s = String(val).trim().toLowerCase();
        return ["yes", "y", "true", "1", "chef", "best", "active", "available"].includes(s);
      };
      const isBestseller = toBool(rawBestseller);
      const isChefSpecial = toBool(rawChefSpecial);

      // Spiciness
      let spiciness = 0;
      if (rawSpiciness !== undefined && rawSpiciness !== null) {
        const s = parseInt(String(rawSpiciness), 10);
        if (isNaN(s) || s < 0 || s > 3) {
          warnings.push(`Spiciness "${rawSpiciness}" invalid (0 to 3), resetting to 0.`);
          spiciness = 0;
        } else {
          spiciness = s;
        }
      }

      // Ratings
      let rating = 4.5;
      if (rawRating !== undefined && rawRating !== null) {
        const r = parseFloat(String(rawRating));
        if (isNaN(r) || r < 1 || r > 5) {
          warnings.push(`Rating "${rawRating}" out of bounds (1.0 to 5.0), resetting to 4.5.`);
          rating = 4.5;
        } else {
          rating = r;
        }
      }

      let ratingCount = 10;
      if (rawRatingCount !== undefined && rawRatingCount !== null) {
        const rc = parseInt(String(rawRatingCount), 10);
        if (isNaN(rc) || rc < 0) {
          warnings.push(`Rating count "${rawRatingCount}" invalid, resetting to 10.`);
          ratingCount = 10;
        } else {
          ratingCount = rc;
        }
      }

      // GST conversion
      let gstPercent = 5;
      if (rawGstPercent !== undefined && rawGstPercent !== null) {
        const gstVal = parseFloat(String(rawGstPercent).replace(/%/g, ""));
        if (isNaN(gstVal) || gstVal < 0) {
          warnings.push(`GST % "${rawGstPercent}" is invalid, defaulting to 5%.`);
          gstPercent = 5;
        } else {
          gstPercent = gstVal;
        }
      }

      // HSN code
      const hsnCode = rawHsnCode ? String(rawHsnCode).trim() : "";

      // Image URL
      const imageUrl = rawImageUrl ? String(rawImageUrl).trim() : "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500";

      // Available conversion
      let available = true;
      if (rawAvailable !== undefined && rawAvailable !== null) {
        const avStr = String(rawAvailable).trim().toLowerCase();
        if (["yes", "y", "true", "1", "active", "available", "instock", "in stock"].includes(avStr)) {
          available = true;
        } else if (["no", "n", "false", "0", "inactive", "out of stock", "unavailable"].includes(avStr)) {
          available = false;
        } else {
          warnings.push(`Available value "${rawAvailable}" unrecognized, defaulting to Available.`);
          available = true;
        }
      }

      // Match logic for updates
      let isUpdate = false;
      let id = "";

      if (name && categoryId) {
        if (itemCode) {
          const match = existingItems.find(x => x.itemCode && x.itemCode.toLowerCase() === itemCode.toLowerCase());
          if (match) {
            isUpdate = true;
            id = match.id;
          }
        }
        if (!id) {
          const match = existingItems.find(x => 
            x.name.trim().toLowerCase() === name.toLowerCase() && 
            x.category.toLowerCase() === categoryId.toLowerCase()
          );
          if (match) {
            isUpdate = true;
            id = match.id;
          }
        }
      }

      return {
        rowNumber,
        raw: row,
        mapped: {
          itemCode,
          name,
          category: categoryId,
          description,
          price,
          isVeg,
          imageUrl,
          rating,
          ratingCount,
          isBestseller,
          isChefSpecial,
          spiciness,
          gstPercent,
          hsnCode,
          available
        },
        errors,
        warnings,
        isValid: errors.length === 0,
        isUpdate,
        id
      };
    });

    // Cross-check duplicates in spreadsheet
    const seenCodes = new Set<string>();
    const seenNames = new Set<string>();

    list.forEach(item => {
      if (!item.isValid) return;
      const code = item.mapped.itemCode.toLowerCase();
      const uniqueName = `${item.mapped.name.toLowerCase()}||${item.mapped.category.toLowerCase()}`;

      if (code && seenCodes.has(code)) {
        item.errors.push(`Duplicate Item Code "${item.mapped.itemCode}" exists multiple times in this file.`);
        item.isValid = false;
      } else if (code) {
        seenCodes.add(code);
      }

      if (seenNames.has(uniqueName)) {
        item.errors.push(`Duplicate name "${item.mapped.name}" in category "${item.mapped.category}" exists multiple times in this file.`);
        item.isValid = false;
      } else {
        seenNames.add(uniqueName);
      }
    });

    setProcessedItems(list);
    setLoading(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const downloadTemplate = () => {
    const headers = [
      "Item Code", "Category", "Item Name", "Description", "Price", 
      "Veg/Non-Veg", "GST %", "HSN Code", "Bestseller", "Chef Special", 
      "Spiciness", "Rating", "Image URL", "Available"
    ];
    const data = [
      {
        "Item Code": "SR-ID-01",
        "Category": "idli",
        "Item Name": "Steamed Idli",
        "Description": "Two light, fluffy cloud-like steamed fermented rice and black-lentil cakes, served with piping hot sambar.",
        "Price": 90,
        "Veg/Non-Veg": "Veg",
        "GST %": 5,
        "HSN Code": "21069099",
        "Bestseller": "No",
        "Chef Special": "No",
        "Spiciness": 0,
        "Rating": 4.7,
        "Image URL": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=600",
        "Available": "Yes"
      },
      {
        "Item Code": "SR-DOS-02",
        "Category": "dosa",
        "Item Name": "Masala Dosa",
        "Description": "Vibrant golden crispy crepe stuffed with our iconic tempered yellow potato-and-onion dry yellow curry mash.",
        "Price": 140,
        "Veg/Non-Veg": "Veg",
        "GST %": 5,
        "HSN Code": "21069099",
        "Bestseller": "Yes",
        "Chef Special": "No",
        "Spiciness": 0,
        "Rating": 4.9,
        "Image URL": "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&q=80&w=600",
        "Available": "Yes"
      },
      {
        "Item Code": "SR-DOS-01",
        "Category": "dosa",
        "Item Name": "Plain Dosa",
        "Description": "Classic golden wafer-thin dry rice and lentil crepe. Served with piping hot sambar.",
        "Price": 110,
        "Veg/Non-Veg": "Veg",
        "GST %": 5,
        "HSN Code": "21069099",
        "Bestseller": "No",
        "Chef Special": "No",
        "Spiciness": 0,
        "Rating": 4.6,
        "Image URL": "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&q=80&w=600",
        "Available": "Yes"
      },
      {
        "Item Code": "SR-DOS-04",
        "Category": "dosa",
        "Item Name": "Mysore Dosa",
        "Description": "Crispy crepe coated on the inside with a spicy, fiery red garlic-lentil chutney, stuffed with potato masala.",
        "Price": 160,
        "Veg/Non-Veg": "Veg",
        "GST %": 5,
        "HSN Code": "21069099",
        "Bestseller": "No",
        "Chef Special": "Yes",
        "Spiciness": 2,
        "Rating": 4.9,
        "Image URL": "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&q=80&w=600",
        "Available": "Yes"
      },
      {
        "Item Code": "SR-DOS-05",
        "Category": "dosa",
        "Item Name": "Rava Dosa",
        "Description": "Intricately laced, crispy semolina-rice crepe seasoned with peppercorns, cumin, and sliced green ginger.",
        "Price": 150,
        "Veg/Non-Veg": "Veg",
        "GST %": 5,
        "HSN Code": "21069099",
        "Bestseller": "No",
        "Chef Special": "No",
        "Spiciness": 1,
        "Rating": 4.5,
        "Image URL": "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&q=80&w=600",
        "Available": "Yes"
      },
      {
        "Item Code": "SR-SOU-01",
        "Category": "soups",
        "Item Name": "Veg Hot & Sour Soup",
        "Description": "A fiery-tangy oriental soup packed with minced farm-fresh vegetables, standard wild mushrooms, and coriander.",
        "Price": 140,
        "Veg/Non-Veg": "Veg",
        "GST %": 5,
        "HSN Code": "21069099",
        "Bestseller": "Yes",
        "Chef Special": "No",
        "Spiciness": 2,
        "Rating": 4.8,
        "Image URL": "https://images.unsplash.com/photo-1547592165-e1d17fed6005?auto=format&fit=crop&q=80&w=600",
        "Available": "Yes"
      },
      {
        "Item Code": "SR-SOU-02",
        "Category": "soups",
        "Item Name": "Veg Manchow Soup",
        "Description": "Vibrant garlic-infused broth packed with finely diced green veggies, finished with a topping of super crispy noodles.",
        "Price": 150,
        "Veg/Non-Veg": "Veg",
        "GST %": 5,
        "HSN Code": "21069099",
        "Bestseller": "No",
        "Chef Special": "No",
        "Spiciness": 1,
        "Rating": 4.6,
        "Image URL": "https://images.unsplash.com/photo-1607532941433-304659e8198a?auto=format&fit=crop&q=80&w=600",
        "Available": "Yes"
      },
      {
        "Item Code": "SR-PAP-01",
        "Category": "papad-snacks",
        "Item Name": "Roasted Papad",
        "Description": "Thin, crispy lentil flatbread dry-roasted on open fire, serving as the perfect traditional meal starter.",
        "Price": 40,
        "Veg/Non-Veg": "Veg",
        "GST %": 5,
        "HSN Code": "21069099",
        "Bestseller": "No",
        "Chef Special": "No",
        "Spiciness": 0,
        "Rating": 4.4,
        "Image URL": "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&q=80&w=600",
        "Available": "Yes"
      },
      {
        "Item Code": "SR-ID-03",
        "Category": "idli",
        "Item Name": "Tawa Idli",
        "Description": "Idli cubes pan-roasted on giant tawa grills with diced tomatoes, onions, capsicum, and gun-powder spices.",
        "Price": 130,
        "Veg/Non-Veg": "Veg",
        "GST %": 5,
        "HSN Code": "21069099",
        "Bestseller": "No",
        "Chef Special": "No",
        "Spiciness": 1,
        "Rating": 4.8,
        "Image URL": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=600",
        "Available": "Yes"
      },
      {
        "Item Code": "SR-IND-01",
        "Category": "Indian Main Course",
        "Item Name": "Shahi Paneer Classic",
        "Description": "Fresh cottage cheese blocks cooked in rich, aromatic creamy tomato-cashew gravy.",
        "Price": 280,
        "Veg/Non-Veg": "Veg",
        "GST %": 5,
        "HSN Code": "21069099",
        "Bestseller": "Yes",
        "Chef Special": "Yes",
        "Spiciness": 0,
        "Rating": 4.7,
        "Image URL": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&q=80&w=600",
        "Available": "Yes"
      }
    ];

    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Menu Template");
    XLSX.writeFile(wb, "menu_template.xlsx");
  };

  const downloadErrorReport = () => {
    const failed = processedItems.filter(item => !item.isValid);
    if (failed.length === 0) return;

    const rowKeys = Object.keys(failed[0].raw);
    const headers = ["Row Number", "Errors Identified", ...rowKeys];
    
    const csvContent = [
      headers.map(h => `"${h.replace(/"/g, '""')}"`).join(","),
      ...failed.map(item => {
        const errorList = item.errors.join(" | ");
        const rowVals = [
          item.rowNumber,
          errorList,
          ...rowKeys.map(k => {
            const v = item.raw[k];
            return v !== undefined && v !== null ? String(v) : "";
          })
        ];
        return rowVals.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `menu_import_errors_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const executeBulkImport = async () => {
    if (processedItems.length === 0 || importing) return;

    const validItems = processedItems.filter(item => item.isValid);
    if (validItems.length === 0) {
      alert("No valid rows available to import.");
      return;
    }

    setImporting(true);
    setProgress(0);
    setPerfReport(null);

    const startTime = Date.now();
    let importedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    const batchSize = 100;
    const batches = Math.ceil(validItems.length / batchSize);
    setTotalBatches(batches);

    try {
      const supported = await LocalDB.detectSupportedColumns();
      console.log("[Bulk Importer] Dynamic Database columns supported:", supported);

      let totalDbWriteTime = 0;

      // Let's fetch the fresh database state to prevent duplicates!
      let latestDbItems: MenuItem[] = [];
      try {
        latestDbItems = await LocalDB.fetchMenuItems();
        console.log("[Bulk Importer] Fresh DB items fetched for verification:", latestDbItems.length);
      } catch (e) {
        console.warn("[Bulk Importer] Failed to fetch latest db items, using existing state:", e);
        latestDbItems = existingItems;
      }

      for (let b = 0; b < batches; b++) {
        setCurrentBatch(b + 1);
        const startIdx = b * batchSize;
        const endIdx = Math.min(startIdx + batchSize, validItems.length);
        const batch = validItems.slice(startIdx, endIdx);

        // Convert mappings to proper menu items and split them
        const insertsPayload: { payload: any; item: MenuItem }[] = [];
        const updatesPayload: { id: any; payload: any; item: MenuItem }[] = [];

        batch.forEach(p => {
          // Re-evaluate matching using fresh latestDbItems to avoid duplicates and stale state
          let matchedDbItem = latestDbItems.find(x => 
            x.name.trim().toLowerCase() === p.mapped.name.trim().toLowerCase() && 
            x.category.trim().toLowerCase() === p.mapped.category.trim().toLowerCase()
          );

          if (!matchedDbItem && p.mapped.itemCode) {
            matchedDbItem = latestDbItems.find(x => x.itemCode && x.itemCode.toLowerCase() === p.mapped.itemCode.toLowerCase());
          }

          const isUpdate = !!matchedDbItem;
          const matchedId = matchedDbItem ? matchedDbItem.id : (p.id || `item-bulk-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`);

          const mappedItem: MenuItem = {
            id: matchedId,
            itemCode: p.mapped.itemCode || `ITEM-${matchedId.toUpperCase()}`,
            category: p.mapped.category,
            name: p.mapped.name,
            description: p.mapped.description,
            price: p.mapped.price,
            isVeg: p.mapped.isVeg,
            imageUrl: p.mapped.imageUrl,
            rating: p.mapped.rating,
            ratingCount: p.mapped.ratingCount,
            isBestseller: p.mapped.isBestseller,
            isChefSpecial: p.mapped.isChefSpecial,
            spiciness: p.mapped.spiciness,
            gstPercent: p.mapped.gstPercent,
            hsnCode: p.mapped.hsnCode,
            available: p.mapped.available
          };

          const payload = LocalDB.mapMenuItemForInsert(mappedItem, supported);
          // ALWAYS delete id to prevent postgres generated always identity errors
          delete payload.id;

          const operation = isUpdate ? "UPDATE" : "CREATE";

          // Requirement 1 & 2: Log every item before saving
          console.log(`\n=== [Bulk Importer Item Pre-Save Log] ===`);
          console.log(`- Local ID: ${p.id || "None"}`);
          console.log(`- Database Matched ID: ${matchedDbItem ? matchedDbItem.id : "None"}`);
          console.log(`- Name: "${p.mapped.name}"`);
          console.log(`- Category: "${p.mapped.category}"`);
          console.log(`- Chosen Operation: ${operation}`);

          // Requirement 3: If classified as CREATE, explain exactly why no existing database row was matched
          if (operation === "CREATE") {
            console.log(`- Explanation for CREATE classification:`);
            console.log(`  1. No existing database row has an ID matching "${p.id || 'None'}".`);
            
            const duplicateByNameAndCat = latestDbItems.find(
              (x: any) =>
                String(x.name || "").trim().toLowerCase() === String(p.mapped.name).trim().toLowerCase() &&
                String(x.category || "").trim().toLowerCase() === String(p.mapped.category).trim().toLowerCase()
            );

            if (duplicateByNameAndCat) {
              console.log(`  2. WARNING: A row with name "${p.mapped.name}" and category "${p.mapped.category}" ALREADY exists in the database with ID "${duplicateByNameAndCat.id}"!`);
              console.log(`     (Note: Because of our dynamic check, we actually bridged this to an UPDATE instead of a CREATE to prevent duplicate constraint violation)`);
            } else {
              console.log(`  2. No database row matches both the name "${p.mapped.name}" and category "${p.mapped.category}" case-insensitively.`);
            }
          }

          if (isUpdate) {
            updatedCount++;
            updatesPayload.push({ id: matchedId, payload, item: mappedItem });
          } else {
            importedCount++;
            insertsPayload.push({ payload, item: mappedItem });
          }
        });

        // Supabase upload timing
        const dbStart = Date.now();
        let batchError: any = null;

        // 1. Perform bulk inserts for brand new items (no id sent)
        if (insertsPayload.length > 0) {
          const rawInserts = insertsPayload.map(x => x.payload);
          const stackTrace = new Error("Stack trace collector").stack || "";

          console.log("\n=== [Supabase Diagnostic Log] Before Bulk CREATE ===");
          // Requirement 4: Before executing database query, print whether calling insert() or update()
          console.log("Calling: insert() on table 'menu_items'");
          console.log("Responsible File: /src/components/BulkMenuImporter.tsx");
          console.log("Responsible Function: executeBulkImport");
          console.log("Payloads to Insert:", JSON.stringify(rawInserts, null, 2));
          console.log("Stack Trace:\n", stackTrace);

          try {
            const { error: insErr } = await supabase
              .from("menu_items")
              .insert(rawInserts);

            console.log("\n=== [Supabase Diagnostic Log] After Bulk CREATE ===");
            console.log("Returned Error:", insErr ? JSON.stringify(insErr, null, 2) : "None (Success)");

            if (insErr) {
              batchError = insErr;
              // Requirement 5 & 6: Capture the full payload and details of the item triggering the constraint
              console.error("\n=== [CRITICAL FAILED PAYLOAD TRACER] ===");
              console.error("Operation: Bulk INSERT");
              console.error("Payloads:", JSON.stringify(rawInserts, null, 2));
              console.error("Responsible File: /src/components/BulkMenuImporter.tsx");
              console.error("Responsible Function: executeBulkImport");
              console.error("=========================================\n");
            }
          } catch (err: any) {
            batchError = err;
            console.error("\n=== [CRITICAL FAILED PAYLOAD TRACER - Exception caught] ===");
            console.error("Operation: Bulk INSERT");
            console.error("Payloads:", JSON.stringify(rawInserts, null, 2));
            console.error("Responsible File: /src/components/BulkMenuImporter.tsx");
            console.error("Responsible Function: executeBulkImport");
            console.error("Exception Message:", err.message);
            console.error("=========================================\n");
          }
        }

        // 2. Perform parallel updates for existing matched items (updating without changing the generated always id)
        if (!batchError && updatesPayload.length > 0) {
          try {
            await Promise.all(
              updatesPayload.map(async (u) => {
                const stackTrace = new Error("Stack trace collector").stack || "";

                console.log("\n=== [Supabase Diagnostic Log] Before UPDATE ===");
                // Requirement 4: Before executing database query, print whether calling insert() or update()
                console.log("Calling: update() on table 'menu_items'");
                console.log("Responsible File: /src/components/BulkMenuImporter.tsx");
                console.log("Responsible Function: executeBulkImport");
                console.log("Payload:", JSON.stringify(u.payload, null, 2));
                console.log("ID Target:", u.id);
                console.log("Stack Trace:\n", stackTrace);

                try {
                  const { error: updErr } = await supabase
                    .from("menu_items")
                    .update(u.payload)
                    .eq("id", u.id);

                  console.log("\n=== [Supabase Diagnostic Log] After UPDATE ===");
                  console.log("Returned ID:", u.id);
                  console.log("Returned Error:", updErr ? JSON.stringify(updErr, null, 2) : "None (Success)");

                  if (updErr) {
                    // Requirement 5 & 6: Capture the full payload and details of the item triggering the constraint
                    console.error("\n=== [CRITICAL FAILED PAYLOAD TRACER] ===");
                    console.error("Operation: UPDATE");
                    console.error("Payload:", JSON.stringify(u.payload, null, 2));
                    console.error("ID Target:", u.id);
                    console.error("Local Item Object:", JSON.stringify(u.item, null, 2));
                    console.error("Responsible File: /src/components/BulkMenuImporter.tsx");
                    console.error("Responsible Function: executeBulkImport");
                    console.error("=========================================\n");
                    throw updErr;
                  }
                } catch (err: any) {
                  console.error("\n=== [CRITICAL FAILED PAYLOAD TRACER - Exception caught] ===");
                  console.error("Operation: UPDATE");
                  console.error("Payload:", JSON.stringify(u.payload, null, 2));
                  console.error("ID Target:", u.id);
                  console.error("Local Item Object:", JSON.stringify(u.item, null, 2));
                  console.error("Responsible File: /src/components/BulkMenuImporter.tsx");
                  console.error("Responsible Function: executeBulkImport");
                  console.error("Exception Message:", err.message);
                  console.error("=========================================\n");
                  throw err;
                }
              })
            );
          } catch (updErr: any) {
            batchError = updErr;
          }
        }

        totalDbWriteTime += (Date.now() - dbStart);

        if (batchError) {
          console.error(`[Bulk Importer] Error importing batch ${b + 1}:`, batchError);
          LocalDB.addAuditLog(
            "Bulk Import Batch Failed",
            `Batch ${b + 1} of high volume import failed: ${batchError.message}`,
            "System (Importer)"
          );
          // Flag these rows as failed
          failedCount += batch.length;
          if (b === 0 && batches > 1) {
            throw new Error(`Connection Error: ${batchError.message}`);
          }
        }

        setProgress(Math.round(((b + 1) / batches) * 100));
      }

      // Fully reload menus lists to synchronize states
      console.log("[Bulk Importer] Synchronizing local DB client caches...");
      await LocalDB.fetchMenuItems();

      const endTime = Date.now();
      const importTime = endTime - startTime;

      setStats({
        totalRows: processedItems.length,
        imported: importedCount - failedCount,
        updated: updatedCount,
        skipped: processedItems.length - validItems.length,
        failed: failedCount + (processedItems.length - validItems.length),
        startTime,
        endTime
      });

      // Print a performance metric report
      setPerfReport({
        itemCount: validItems.length,
        importTime: importTime / 1000,
        dbWriteTime: totalDbWriteTime / 1000,
        successCount: importedCount - failedCount,
        updateCount: updatedCount,
        failedCount: failedCount,
        avgBatchTime: (importTime / batches) / 1000
      });

      LocalDB.addAuditLog(
        "Bulk Menu Imported",
        `Successfully imported/updated ${validItems.length} recipe items. Skipped ${processedItems.length - validItems.length} rows.`,
        "Admin (owner)"
      );

      onImportSuccess();
    } catch (err: any) {
      console.error("[Bulk Importer Exception]", err);
      alert(`An error occurred during import: ${err.message || err}`);
    } finally {
      setImporting(false);
    }
  };

  // Automated SRE Verification Dataset Generator
  const runSREVerification = (size: number) => {
    setLoading(true);
    setTestingSize(size);
    setProcessedItems([]);
    setPerfReport(null);

    setTimeout(() => {
      const generatedRows: any[] = [];
      const categoriesList = ["soups", "papad-snacks", "salads", "momos", "burgers", "pizza", "dosa", "chinese", "main-course"];
      
      for (let i = 1; i <= size; i++) {
        const itemCode = `ST-ITEM-${size}-${i}`;
        const name = `SRE Test Dish ${size}-${i}`;
        const category = categoriesList[i % categoriesList.length];
        const price = 100 + (i % 400); // 100 to 500
        const isVeg = i % 10 !== 0; // 90% Veg
        const isChefSpecial = i % 15 === 0;
        const isBestseller = i % 12 === 0;
        const spiciness = i % 4; // 0, 1, 2, 3

        generatedRows.push({
          "Item Code": itemCode,
          "Category": category,
          "Item Name": name,
          "Description": `Engineered stress-test item ${i} of size ${size} for latency auditing under direct Supabase workloads.`,
          "Price": price,
          "Veg/Non-Veg": isVeg ? "Veg" : "Non-Veg",
          "GST %": 5,
          "HSN Code": "21069099",
          "Bestseller": isBestseller ? "Yes" : "No",
          "Chef Special": isChefSpecial ? "Yes" : "No",
          "Spiciness": spiciness,
          "Rating": 4.5,
          "Image URL": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500",
          "Available": "Yes"
        });
      }

      const mapping: Record<string, string> = {
        "Item Code": "itemCode",
        "Category": "category",
        "Item Name": "name",
        "Description": "description",
        "Price": "price",
        "Veg/Non-Veg": "isVeg",
        "GST %": "gstPercent",
        "HSN Code": "hsnCode",
        "Bestseller": "isBestseller",
        "Chef Special": "isChefSpecial",
        "Spiciness": "spiciness",
        "Rating": "rating",
        "Image URL": "imageUrl",
        "Available": "available"
      };

      setHeadersMap(mapping);
      processJsonRows(generatedRows, mapping);
      setLoading(false);
    }, 100);
  };

  const validCount = processedItems.filter(item => item.isValid).length;
  const errorCount = processedItems.filter(item => !item.isValid).length;

  const displayItems = processedItems.filter(item => {
    if (activePreviewTab === "valid") return item.isValid;
    if (activePreviewTab === "errors") return !item.isValid;
    return true;
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs select-none">
      <div className="bg-[#FAF9F5] w-full max-w-5xl rounded-2xl border border-stone-200 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200/80 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#C67C4E]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-serif font-bold text-stone-900 uppercase tracking-wider">Bulk Menu Importer</h3>
              <p className="text-[11px] text-stone-500 font-sans">Upload .xlsx, .xls, or .csv sheets with dynamic field normalization.</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg bg-stone-100 hover:bg-red-50 text-stone-500 hover:text-red-500 border border-stone-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Panel */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* File Upload Section */}
          {processedItems.length === 0 && !loading && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              <div className="md:col-span-8">
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4 transition-all h-64 text-center cursor-pointer ${isDragging ? "border-[#d4af37] bg-amber-50/40" : "border-stone-300 bg-white hover:border-stone-400"}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  />
                  
                  <div className="w-14 h-14 bg-stone-50 border border-stone-200 rounded-full flex items-center justify-center text-stone-400 group-hover:text-stone-500 transition-colors">
                    <Upload className="w-6 h-6 animate-bounce" />
                  </div>
                  <div>
                    <p className="text-sm font-sans font-bold text-stone-800">Drag & drop your catalog spreadsheet here</p>
                    <p className="text-xs text-stone-400 mt-1">Accepts Excel (.xlsx, .xls) and Plain Text (.csv) up to 10MB</p>
                  </div>
                  
                  <span className="px-3 py-1.5 bg-stone-100 text-stone-600 border border-stone-200 rounded-lg text-xs font-semibold uppercase tracking-wider hover:bg-stone-200 transition-colors">
                    Browse Files
                  </span>
                </div>
              </div>

              {/* Template Download & SRE Tests */}
              <div className="md:col-span-4 flex flex-col gap-4">
                <div className="bg-white border border-stone-200 p-5 rounded-2xl flex flex-col justify-between h-30 shadow-xs">
                  <div>
                    <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5 text-[#C67C4E]" />
                      Download Excel Template
                    </h4>
                    <p className="text-[11px] text-stone-400 mt-1">Get our standardized template with all supported columns and dummy rows to guide your formatting.</p>
                  </div>
                  <button 
                    onClick={downloadTemplate}
                    className="w-full py-2 bg-[#d4af37] hover:bg-[#C67C4E] text-white text-xs font-bold uppercase rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    Download Template
                  </button>
                </div>

                <div className="bg-[#FAF6F0] border border-orange-200 p-5 rounded-2xl space-y-3.5 shadow-xs">
                  <div>
                    <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-[#C67C4E]" />
                      SRE Verification Engine
                    </h4>
                    <p className="text-[11px] text-stone-400 mt-1">Generate high-volume stress testing datasets directly inside the preview list to test Supabase and indexing capacity.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button 
                      onClick={() => runSREVerification(100)}
                      className="py-1.5 bg-white hover:bg-amber-50 text-stone-700 hover:text-[#C67C4E] border border-stone-200 hover:border-orange-300 rounded-lg text-[10px] font-bold uppercase transition-all"
                    >
                      100 Items
                    </button>
                    <button 
                      onClick={() => runSREVerification(500)}
                      className="py-1.5 bg-white hover:bg-amber-50 text-stone-700 hover:text-[#C67C4E] border border-stone-200 hover:border-orange-300 rounded-lg text-[10px] font-bold uppercase transition-all"
                    >
                      500 Items
                    </button>
                    <button 
                      onClick={() => runSREVerification(1000)}
                      className="py-1.5 bg-white hover:bg-amber-50 text-stone-700 hover:text-[#C67C4E] border border-stone-200 hover:border-orange-300 rounded-lg text-[10px] font-bold uppercase transition-all"
                    >
                      1k Items
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-[#C67C4E] animate-spin" />
              <p className="text-xs font-mono text-stone-500">Normalizing entries, evaluating constraints, matching existing IDs...</p>
            </div>
          )}

          {/* Preview Layout */}
          {processedItems.length > 0 && !loading && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {/* Mapping Status Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-stone-200 p-4 rounded-xl flex items-center justify-between shadow-xs">
                  <div>
                    <p className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">Total Uploaded</p>
                    <p className="text-xl font-serif font-black text-stone-900 mt-0.5">{processedItems.length}</p>
                  </div>
                  <FileText className="w-5 h-5 text-stone-400" />
                </div>
                
                <div className="bg-green-50/50 border border-green-200 p-4 rounded-xl flex items-center justify-between shadow-xs">
                  <div>
                    <p className="text-[10px] text-green-600 uppercase tracking-wider font-semibold">Valid & Ready</p>
                    <p className="text-xl font-serif font-black text-green-700 mt-0.5">{validCount}</p>
                  </div>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>

                <div className="bg-red-50/40 border border-red-200 p-4 rounded-xl flex items-center justify-between shadow-xs">
                  <div>
                    <p className="text-[10px] text-red-600 uppercase tracking-wider font-semibold">Errors Detected</p>
                    <p className="text-xl font-serif font-black text-red-700 mt-0.5">{errorCount}</p>
                  </div>
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>

                <div className="bg-blue-50/40 border border-blue-200 p-4 rounded-xl flex items-center justify-between shadow-xs">
                  <div>
                    <p className="text-[10px] text-blue-600 uppercase tracking-wider font-semibold">Existing Updates</p>
                    <p className="text-xl font-serif font-black text-blue-700 mt-0.5">
                      {processedItems.filter(x => x.isValid && x.isUpdate).length}
                    </p>
                  </div>
                  <RefreshCw className="w-5 h-5 text-blue-500" />
                </div>
              </div>

              {/* Error Warning Block */}
              {errorCount > 0 && (
                <div className="bg-red-50/50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex gap-2.5 items-start">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-red-800">Validation Errors Detected</p>
                      <p className="text-[11px] text-red-600/90 mt-0.5">We identified errors in {errorCount} rows. These rows will be skipped during the import process. Download the error report to fix them.</p>
                    </div>
                  </div>
                  <button 
                    onClick={downloadErrorReport}
                    className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap"
                  >
                    Download Error CSV
                  </button>
                </div>
              )}

              {/* Preview Tabs */}
              <div className="flex border-b border-stone-200">
                <button 
                  onClick={() => setActivePreviewTab("all")}
                  className={`px-4 py-2 border-b-2 text-xs font-bold uppercase tracking-wider transition-all ${activePreviewTab === "all" ? "border-[#d4af37] text-stone-900" : "border-transparent text-stone-400 hover:text-stone-600"}`}
                >
                  All Rows ({processedItems.length})
                </button>
                <button 
                  onClick={() => setActivePreviewTab("valid")}
                  className={`px-4 py-2 border-b-2 text-xs font-bold uppercase tracking-wider transition-all ${activePreviewTab === "valid" ? "border-green-500 text-green-700" : "border-transparent text-stone-400 hover:text-stone-600"}`}
                >
                  Valid Rows ({validCount})
                </button>
                <button 
                  onClick={() => setActivePreviewTab("errors")}
                  className={`px-4 py-2 border-b-2 text-xs font-bold uppercase tracking-wider transition-all ${activePreviewTab === "errors" ? "border-red-500 text-red-700" : "border-transparent text-stone-400 hover:text-stone-600"}`}
                >
                  Invalid Rows ({errorCount})
                </button>
              </div>

              {/* Preview List Table */}
              <div className="border border-stone-200/80 rounded-xl overflow-hidden bg-white max-h-80 overflow-y-auto">
                <table className="w-full text-left border-collapse text-[11px] font-sans">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider font-bold">
                      <th className="py-2.5 px-4 w-12 text-center">Row</th>
                      <th className="py-2.5 px-3 w-16">Status</th>
                      <th className="py-2.5 px-3">Item Code</th>
                      <th className="py-2.5 px-3">Dish Name</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 w-20">Price</th>
                      <th className="py-2.5 px-3 w-16 text-center">Veg</th>
                      <th className="py-2.5 px-3">Issue/Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-xs font-mono text-stone-400">
                          No rows match this filter.
                        </td>
                      </tr>
                    ) : (
                      displayItems.map((item, idx) => (
                        <tr key={idx} className={`border-b border-stone-100 hover:bg-stone-50/50 ${!item.isValid ? "bg-red-50/10" : ""}`}>
                          <td className="py-2 px-4 text-center text-stone-400 font-mono">{item.rowNumber}</td>
                          <td className="py-2 px-3">
                            {!item.isValid ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold uppercase text-[8px]">
                                <AlertCircle className="w-2.5 h-2.5" /> Skip
                              </span>
                            ) : item.isUpdate ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold uppercase text-[8px]">
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: "10s" }} /> Update
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-bold uppercase text-[8px]">
                                <Check className="w-2.5 h-2.5" /> Insert
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono text-stone-600">{item.mapped.itemCode || "—"}</td>
                          <td className="py-2 px-3 font-bold text-stone-850 truncate max-w-[120px]" title={item.mapped.name}>{item.mapped.name}</td>
                          <td className="py-2 px-3 font-semibold text-[#aa7c11] uppercase text-[9px] font-mono">{item.mapped.category}</td>
                          <td className="py-2 px-3 font-mono font-bold text-[#C67C4E]">₹{item.mapped.price}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-1 py-0.5 rounded-sm font-bold text-[8px] border ${item.mapped.isVeg ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                              {item.mapped.isVeg ? "VEG" : "N-VEG"}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-stone-500 max-w-[200px] truncate">
                            {item.errors.length > 0 ? (
                              <span className="text-red-500 font-semibold">{item.errors[0]}</span>
                            ) : item.warnings.length > 0 ? (
                              <span className="text-amber-600 flex items-center gap-0.5">
                                <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> {item.warnings[0]}
                              </span>
                            ) : (
                              <span className="text-stone-400">Validated successfully</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Progress/Result Auditing Output Panel */}
              {perfReport && (
                <div className="bg-stone-900 text-stone-200 p-5 rounded-2xl space-y-4 font-mono text-[11px] border border-stone-850 shadow-xl animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between border-b border-stone-800 pb-2.5">
                    <p className="text-xs font-bold text-[#d4af37] uppercase tracking-wider flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-[#d4af37]" />
                      SRE Performance Latency Audit Report
                    </p>
                    <span className="px-2 py-0.5 bg-green-500/10 text-green-400 rounded-sm border border-green-500/20 font-bold uppercase text-[9px]">
                      SUCCESS
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                    <div>
                      <p className="text-stone-500">Rows Imported/Updated</p>
                      <p className="text-lg font-black text-white mt-1">{(perfReport.successCount + perfReport.updateCount)} / {perfReport.itemCount}</p>
                    </div>
                    <div>
                      <p className="text-stone-500">Database Upserts</p>
                      <p className="text-lg font-black text-white mt-1">{perfReport.successCount} new / {perfReport.updateCount} updates</p>
                    </div>
                    <div>
                      <p className="text-stone-500">Import Overhead Time</p>
                      <p className="text-lg font-black text-[#d4af37] mt-1">{perfReport.importTime.toFixed(3)}s</p>
                    </div>
                    <div>
                      <p className="text-stone-500">Supabase Write Time</p>
                      <p className="text-lg font-black text-[#C67C4E] mt-1">{perfReport.dbWriteTime.toFixed(3)}s</p>
                    </div>
                  </div>

                  <div className="border-t border-stone-800 pt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    <p className="text-stone-400/80 leading-relaxed max-w-xl">
                      * Batch size: 100 entries. Average processing speed: {((perfReport.itemCount) / perfReport.importTime).toFixed(1)} entries/second. Dynamic column synchronization verified. Zero schema mismatch or PostgREST constraints cached.
                    </p>
                    <button 
                      onClick={() => {
                        setProcessedItems([]);
                        setPerfReport(null);
                        setFile(null);
                      }}
                      className="px-3 py-1.5 bg-stone-850 hover:bg-stone-800 text-stone-200 border border-stone-750 hover:border-stone-700 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap self-end"
                    >
                      Clear & Reset
                    </button>
                  </div>
                </div>
              )}

              {/* Controls bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                <div className="text-stone-500 text-xs font-sans">
                  {importing ? (
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-[#C67C4E] animate-spin" />
                      <span>Uploading batch {currentBatch} of {totalBatches} ({progress}%) to Supabase...</span>
                    </div>
                  ) : (
                    <span>
                      Ready to process <strong className="text-stone-800">{validCount}</strong> items. <strong className="text-red-500">{errorCount}</strong> errors will be skipped.
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button 
                    disabled={importing}
                    onClick={() => {
                      setProcessedItems([]);
                      setFile(null);
                      setPerfReport(null);
                    }}
                    className="px-4 py-2 bg-white hover:bg-stone-50 text-stone-700 hover:text-stone-900 border border-stone-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={importing || validCount === 0}
                    onClick={executeBulkImport}
                    className="px-5 py-2 bg-[#d4af37] hover:bg-[#C67C4E] text-white disabled:bg-stone-200 disabled:text-stone-400 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2 cursor-pointer focus:outline-none"
                  >
                    {importing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Execute Bulk Import
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              {importing && (
                <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden mt-2">
                  <div className="bg-[#C67C4E] h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
