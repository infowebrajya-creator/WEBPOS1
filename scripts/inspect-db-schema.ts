import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://jkkwrhywfpbitwvffkxx.supabase.co";
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_D1rREhO08nd1vWNmxyugCg_Fff4X10Y";
const supabase = createClient(supabaseUrl, supabaseKey);

const tables = [
  'ingredient_categories',
  'ingredients',
  'inventory_transactions',
  'menu_items',
  'orders',
  'purchase_items',
  'purchases',
  'recipe_items',
  'recipes',
  'restaurants',
  'suppliers',
  'wastage'
];

async function main() {
  console.log("=== INSPECTING LIVE SUPABASE TABLES ===");
  
  // Try inspecting from a row in each table first
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table: ${table} -> ERROR: ${error.message} (code: ${error.code})`);
    } else if (data && data.length > 0) {
      console.log(`Table: ${table} (from data row) -> columns (${Object.keys(data[0]).length}):`, Object.keys(data[0]));
    } else {
      console.log(`Table: ${table} -> 0 rows returned, trying column probes...`);
    }
  }

  // Also try querying information_schema or checking common columns
  const { data: infoData, error: infoErr } = await supabase
    .from('information_schema.columns' as any)
    .select('table_name, column_name, data_type')
    .in('table_name', tables);

  if (!infoErr && infoData) {
    console.log("=== INFORMATION_SCHEMA RESULT ===");
    console.log(infoData);
  } else {
    // Probe columns for tables with 0 rows
    await probeColumns();
  }
}

async function probeColumns() {
  // Let's test known/likely columns for each table
  const candidates: Record<string, string[]> = {
    ingredient_categories: ['id', 'name', 'description', 'is_active', 'created_at', 'updated_at', 'business_id', 'restaurant_id', 'slug'],
    ingredients: ['id', 'name', 'category_id', 'base_unit', 'current_stock', 'minimum_stock', 'maximum_stock', 'average_cost_per_unit', 'is_active', 'created_at', 'updated_at', 'unit', 'cost_per_unit', 'min_alert_level', 'max_stock_level', 'reorder_quantity', 'business_id', 'storage_type'],
    inventory_transactions: [
      'id', 'ingredient_id', 'transaction_type', 'quantity', 'unit', 'unit_cost', 'total_cost', 'reference_id', 'reference_type', 'reference_item_id', 'notes', 'performed_by', 'created_at', 'previous_stock', 'new_stock', 'business_id', 'restaurant_id'
    ],
    menu_items: ['id', 'category', 'name', 'price', 'is_veg', 'best_seller', 'chef_special', 'special', 'created_at', 'updated_at', 'description', 'image', 'is_bestseller', 'is_chef_special'],
    orders: [
      'id', 'order_number', 'table_number', 'customer_name', 'customer_phone', 'customer_email',
      'items', 'subtotal', 'tax', 'discount', 'total', 'grand_total', 'status', 'order_status',
      'payment_status', 'payment_method', 'order_type', 'notes', 'created_at', 'updated_at',
      'table_id', 'server_name', 'staff_id', 'cgst', 'sgst', 'vat', 'service_charge', 'round_off',
      'settled_at', 'cancelled_at', 'business_id', 'restaurant_id', 'created_by', 'split_settlements',
      'guest_count', 'kot_status', 'preparation_notes'
    ],
    purchase_items: ['id', 'purchase_id', 'ingredient_id', 'quantity', 'unit', 'unit_cost', 'total_cost', 'created_at', 'received_quantity', 'notes', 'business_id'],
    purchases: ['id', 'supplier_id', 'invoice_number', 'status', 'purchase_date', 'subtotal', 'tax', 'total', 'notes', 'created_at', 'updated_at', 'business_id', 'purchase_number'],
    recipe_items: ['id', 'recipe_id', 'ingredient_id', 'quantity', 'unit', 'notes', 'created_at', 'updated_at', 'wastage_percentage', 'yield_percentage', 'cost'],
    recipes: ['id', 'menu_item_id', 'name', 'description', 'portion_size', 'instructions', 'created_at', 'updated_at', 'yield', 'prep_time', 'cook_time', 'business_id'],
    restaurants: ['id', 'name', 'address', 'phone', 'email', 'gst_number', 'created_at', 'updated_at', 'fssai_number', 'logo_url', 'is_active'],
    suppliers: ['id', 'name', 'contact_person', 'phone', 'email', 'address', 'gst_number', 'is_active', 'created_at', 'updated_at', 'business_id', 'payment_terms', 'notes'],
    wastage: ['id', 'ingredient_id', 'quantity', 'unit', 'reason', 'notes', 'cost_per_unit', 'total_loss', 'created_by', 'created_at', 'business_id', 'action_taken']
  };

  console.log("\n=== PROBING COLUMNS FOR TABLES ===");
  for (const [table, cols] of Object.entries(candidates)) {
    const valid: string[] = [];
    for (const col of cols) {
      const { error } = await supabase.from(table).select(col).limit(1);
      if (!error || (error.code !== "42703" && !error.message?.includes('does not exist'))) {
        valid.push(col);
      }
    }
    console.log(`Table ${table} -> found ${valid.length} valid probed columns:`, valid);
  }
}

main().catch(console.error);
