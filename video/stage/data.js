// Demo data. Every value here is invented for the video: a fictional coffee
// and tea company on a "contoso" environment, with Microsoft's well-known
// sample names (Contoso, Northwind Traders, USMF/GBSI). Nothing is taken from a
// real environment - see store-assets/README.md for why that matters.
'use strict';

const ENV = 'contoso.operations.eu.dynamics.com';
const ENV_PROXY = 'contoso.operations.dynamics.com.mcas.ms';
const CMP = 'USMF';

const URLS = {
  sales: `https://${ENV}/?cmp=USMF&mi=SalesTableDetails&SalesId=SO-000148`,
  formula: `https://${ENV}/?cmp=USMF&mi=ProdBOM&ProdId=P-000742`,
  load: `https://${ENV}/?cmp=USMF&mi=WHSLoadTable&LoadId=USMF-000231`,
  store: 'https://microsoftedge.microsoft.com/addons/search/D365FO%20Inventory%20Hover',
  proxy: `https://${ENV_PROXY}/?cmp=USMF&mi=SalesTableDetails&SalesId=SO-000148`,
  options: 'extension://kpmhhdjgkcnbnfiaomhffljlgbeoicbe/options.html'
};

const SALES_PAGE = {
  company: CMP,
  crumbs: ['Accounts receivable', 'Orders', 'All sales orders'],
  actionPane: {
    left: [{ icon: 'edit', label: 'Edit' }, { icon: 'add', label: 'New' }, { icon: 'del', label: 'Delete' }, '|'],
    tabs: ['Sales order', 'Sell', 'Manage', 'Pick and pack', 'Invoice', 'Commerce', 'General', 'Warehouse', 'Transportation', 'Credit management', 'Options']
  },
  caption: 'Sales order details', title: 'SO-000148 : Northwind Traders', titleRight: 'Open order',
  tabs: ['Lines', 'Header'],
  blocks: [
    { type: 'fasttab', title: 'Sales order header', right: 'Northwind Traders' },
    {
      type: 'grid', title: 'Sales order lines', selected: 0, height: 372, scroll: 58,
      toolbar: [{ icon: 'add', label: 'Add line' }, { icon: 'add', label: 'Add lines' }, { label: 'Add products' }, { icon: 'del', label: 'Remove' },
        { label: 'Sales order line', chevron: true }, { label: 'Financials', chevron: true }, { label: 'Inventory', chevron: true },
        { label: 'Product and supply', chevron: true }, { label: 'Update line', chevron: true }, { label: 'Warehouse', chevron: true }, { label: 'Retail', chevron: true }],
      columns: [
        { key: 'variant', label: 'Variant number', w: 118 },
        { key: 'item', label: 'Item number', w: 116, link: true, pencil: true },
        { key: 'name', label: 'Product name', w: 230 },
        { key: 'cat', label: 'Sales category', w: 118 },
        { key: 'qty', label: 'Quantity', w: 84, align: 'r' },
        { key: 'unit', label: 'Unit', w: 58, link: true },
        { key: 'site', label: 'Site', w: 56, link: true },
        { key: 'wh', label: 'Warehouse', w: 90, link: true },
        { key: 'price', label: 'Unit price', w: 92, align: 'r' },
        { key: 'amount', label: 'Net amount', w: 100, align: 'r' },
        { key: 'dtype', label: 'Delivery type', w: 104 }
      ],
      rows: [
        { item: 'FG-10421', name: 'Espresso roast, whole bean 1 kg', cat: 'Coffee', qty: '24.00', unit: 'pcs', site: 'S01', wh: 'WH01', price: '18.50', amount: '444.00', dtype: 'Stock' },
        { item: 'FG-10435', name: 'Decaf house blend, ground 500 g', cat: 'Coffee', qty: '36.00', unit: 'pcs', site: 'S01', wh: 'WH01', price: '9.20', amount: '331.20', dtype: 'Stock' },
        { item: 'FG-10458', name: 'Breakfast tea, 100 bags', cat: 'Tea', qty: '48.00', unit: 'pcs', site: 'S01', wh: 'WH02', price: '6.40', amount: '307.20', dtype: 'Stock' },
        { item: 'FG-10470', name: 'Cold brew concentrate, 1 L', cat: 'Coffee', qty: '60.00', unit: 'pcs', site: 'S01', wh: 'WH02', price: '7.90', amount: '474.00', dtype: 'Stock' }
      ]
    },
    { type: 'fasttab', title: 'Line details', right: '' }
  ]
};

const FORMULA_PAGE = {
  company: CMP,
  crumbs: ['Production control', 'Production orders', 'All production orders'],
  actionPane: {
    left: [{ icon: 'edit', label: 'Edit' }, { icon: 'add', label: 'New' }, { icon: 'del', label: 'Delete' }, { label: 'Copy', disabled: true }],
    tabs: [{ label: 'Inventory', chevron: true }, { label: 'Ingredients', chevron: true }, { label: 'Inquiries', chevron: true }, { label: 'Warehouse', chevron: true }, { label: 'Engineering change', chevron: true }, 'Options']
  },
  formulaHeader: 'Formula lines - batch P-000742, Espresso roast, whole bean 1 kg   |   P-000742 : Espresso roast, whole bean 1 kg',
  blocks: [{
    type: 'grid', height: 520, scroll: 62,
    columns: [
      { key: 'item', label: 'Item number', w: 124, link: true, pencil: true },
      { key: 'site', label: 'Site', w: 70, muted: true },
      { key: 'wh', label: 'Warehouse', w: 104 },
      { key: 'loc', label: 'Location', w: 96 },
      { key: 'status', label: 'Inventory status', w: 128 },
      { key: 'qty', label: 'Quantity', w: 100, align: 'r' },
      { key: 'per', label: 'Per series', w: 100, align: 'r', muted: true },
      { key: 'unit', label: 'Unit', w: 58 },
      { key: 'name', label: 'Product name', w: 250 },
      { key: 'type', label: 'Ingredient type', w: 120 }
    ],
    rows: [
      { item: 'RM-20011', site: 'S01', wh: 'WH01', status: 'Available', qty: '620.0000', per: '1000.0000', unit: 'kg', name: 'Arabica green beans, Brazil', type: 'None' },
      { item: 'RM-20014', site: 'S01', wh: 'WH01', status: 'Available', qty: '310.0000', per: '1000.0000', unit: 'kg', name: 'Arabica green beans, Colombia', type: 'None' },
      { item: 'RM-20027', site: 'S01', wh: 'WH01', status: 'Available', qty: '70.0000', per: '1000.0000', unit: 'kg', name: 'Robusta green beans, Vietnam', type: 'None' },
      { item: 'PK-30102', site: 'S01', wh: 'WH01', status: 'Available', qty: '1000.0000', per: '1000.0000', unit: 'pcs', name: 'Valve bag 1 kg, kraft', type: 'None' },
      { item: 'PK-30118', site: 'S01', wh: 'WH01', status: 'Available', qty: '1000.0000', per: '1000.0000', unit: 'pcs', name: 'Label, espresso roast 1 kg', type: 'None' },
      { item: 'PK-30140', site: 'S01', wh: 'WH01', status: 'Available', qty: '84.0000', per: '1000.0000', unit: 'pcs', name: 'Shipping carton, 12 x 1 kg', type: 'None' }
    ]
  }]
};

const LOAD_PAGE = {
  company: CMP,
  crumbs: ['Warehouse management', 'Loads', 'All loads'],
  actionPane: {
    left: [{ icon: 'save', label: 'Save', disabled: true }, { icon: 'add', label: 'New' }, { icon: 'del', label: 'Delete', disabled: true }],
    tabs: [{ label: 'Loads', active: true }, 'Ship and receive', 'Transportation', 'Options'],
    report: false,
    groups: [
      { title: 'Actions', cols: [['~Change work location', 'Compatibility check']] },
      { title: 'Work', cols: [['~Reverse work', '~Skip non-mandatory work']] },
      { title: 'Related information', cols: [['Wave details', 'Work', 'Posting errors'], ['Load seal numbers', 'Load history', '~Wave labels']] },
      { title: 'Containers', cols: [['Containers', 'Container structure']] },
      { title: 'Print', cols: [['Pick list', 'Load list report'], ['Load details', 'Print label']] }
    ]
  },
  caption: 'Load details', title: 'USMF-000231 : Outbound', tabs: ['Lines', 'Header'],
  factbox: { title: 'Related information', items: ['Pick up and Drop off', 'Open or in process work', 'Appointments', 'Related orders', 'Shipments'] },
  blocks: [
    { type: 'fasttab', title: 'Load', right: '' },
    {
      type: 'grid', title: 'Load lines', selected: 0, height: 262, scroll: 52,
      toolbar: [{ icon: 'del', label: 'Delete', disabled: true }, { label: 'Reduce picked quantity' }, { label: 'Display dimensions' },
        { label: 'Sales line serials', disabled: true }, { label: 'Planned cross docking' }, { label: 'Cancel cross docking' }],
      columns: [
        { key: 'invalid', label: 'Invalid', w: 70 },
        { key: 'order', label: 'Order number', w: 112, link: true },
        { key: 'ship', label: 'Shipment ID', w: 112, link: true },
        { key: 'item', label: 'Item number', w: 112, link: true },
        { key: 'name', label: 'Product name', w: 252 },
        { key: 'qty', label: 'Quantity', w: 80, align: 'r' },
        { key: 'unit', label: 'Unit', w: 54 },
        { key: 'config', label: 'Configuration', w: 104 },
        { key: 'size', label: 'Size', w: 60 },
        { key: 'color', label: 'Color', w: 60 }
      ],
      rows: [
        { order: 'SO-000152', ship: 'SH-000231', item: 'EQ-50210', name: 'Espresso machine Barista Pro, 230 V', qty: '2.00', unit: 'pcs' },
        { order: 'SO-000152', ship: 'SH-000231', item: 'FG-10421', name: 'Espresso roast, whole bean 1 kg', qty: '24.00', unit: 'pcs' },
        { order: 'SO-000157', ship: 'SH-000231', item: 'FG-10458', name: 'Breakfast tea, 100 bags', qty: '48.00', unit: 'pcs' }
      ]
    }
  ]
};

// Tooltip contents, in the shape buildTooltip() expects.
const TIPS = {
  espresso: {
    header: 'FG-10421 - Espresso roast, whole bean 1 kg',
    product: { fields: [
      ['Inventory unit', 'pcs'], ['Item model group', 'FIFO'],
      ['Tracking dimension group', 'BATCH'], ['Reservation hierarchy', 'BatchBelow'],
      ['Coverage group', 'MIN-MAX'], ['Production type', 'Formula'],
      ['Cost group', 'FG'], ['Filter code 1', 'COFFEE'],
      ['Filter code 2', 'WHOLEBEAN'], ['Filter code 3', 'DARK'],
      ['Tax group', 'STD'], ['Unit sequence group', 'PCS-BOX']] },
    rows: [
      { warehouse: 'WH01', physical: 1240, available: 1086, reserved: 154, ordered: 600, onOrder: 0 },
      { warehouse: 'WH02', physical: 380, available: 356, reserved: 24, ordered: 0, onOrder: 250 },
      { warehouse: 'WH05', physical: 96, available: 96, reserved: 0, ordered: 0, onOrder: 0 }],
    timestamp: '10:24:07'
  },
  decaf: {
    header: 'FG-10435 - Decaf house blend, ground 500 g',
    product: { fields: [
      ['Inventory unit', 'pcs'], ['Item model group', 'FIFO'],
      ['Tracking dimension group', 'BATCH'], ['Reservation hierarchy', 'BatchBelow'],
      ['Coverage group', 'MIN-MAX'], ['Production type', 'Formula'],
      ['Cost group', 'FG'], ['Filter code 1', 'COFFEE'],
      ['Filter code 2', 'GROUND'], ['Tax group', 'STD'],
      ['Unit sequence group', 'PCS-BOX']] },
    rows: [
      { warehouse: 'WH01', physical: 512, available: 476, reserved: 36, ordered: 0, onOrder: 400 },
      { warehouse: 'WH02', physical: 140, available: 140, reserved: 0, ordered: 0, onOrder: 0 }],
    timestamp: '09:02:31'
  },
  valveBag: {
    header: 'PK-30102 - Valve bag 1 kg, kraft',
    product: { fields: [
      ['Inventory unit', 'pcs'], ['Item model group', 'FIFO'],
      ['Tracking dimension group', 'NONE'], ['Reservation hierarchy', 'Standard'],
      ['Coverage group', 'MIN-MAX'], ['Production type', 'None'],
      ['Cost group', 'PACK'], ['Filter code 1', 'PACKAGING'],
      ['Primary vendor', 'V-2045'], ['Tax group', 'STD'],
      ['Unit sequence group', 'PCS']] },
    rows: [{ warehouse: 'WH01', physical: 3200, available: 2150, reserved: 1050, ordered: 0, onOrder: 5000 }],
    timestamp: '10:31:44'
  },
  label: {
    // No stock: ReleasedProductsV2 has no product name, so the header is the
    // item number alone (see README "Notes and limits").
    header: 'PK-30118',
    product: { fields: [
      ['Inventory unit', 'pcs'], ['Item model group', 'FIFO'],
      ['Tracking dimension group', 'NONE'], ['Reservation hierarchy', 'Standard'],
      ['Coverage group', 'REQ'], ['Production type', 'None'],
      ['Cost group', 'PACK'], ['Filter code 1', 'LABELS'],
      ['Primary vendor', 'V-3310'], ['Tax group', 'STD'],
      ['Unit sequence group', 'PCS']] },
    rows: [],
    note: 'No inventory records found in company USMF',
    timestamp: '10:31:52'
  },
  machine: {
    header: 'EQ-50210 - Espresso machine Barista Pro, 230 V',
    product: { fields: [
      ['Inventory unit', 'pcs'], ['Item model group', 'STD'],
      ['Tracking dimension group', 'SERIAL'], ['Reservation hierarchy', 'Standard'],
      ['Coverage group', 'REQ'], ['Production type', 'BOM'],
      ['Cost group', 'EQUIP'], ['Filter code 1', 'MACHINES'],
      ['Tax group', 'STD'], ['Unit sequence group', 'PCS']] },
    rows: [
      { company: 'usmf', warehouse: 'WH01', version: 'V1', physical: 8, available: 8, reserved: 0, ordered: 0, onOrder: 0 },
      { company: 'usmf', warehouse: 'WH01', version: 'V2', physical: 14, available: 11, reserved: 3, ordered: 0, onOrder: 20 }],
    timestamp: '10:36:18'
  }
};
TIPS.machineCross = {
  ...TIPS.machine,
  cross: true,
  product: { ...TIPS.machine.product, company: 'USMF' },
  rows: [
    { company: 'USMF', warehouse: 'WH01', version: 'V1', physical: 8, available: 8, reserved: 0, ordered: 0, onOrder: 0 },
    { company: 'USMF', warehouse: 'WH01', version: 'V2', physical: 14, available: 11, reserved: 3, ordered: 0, onOrder: 20 },
    { company: 'GBSI', warehouse: 'LON-01', version: 'V2', physical: 6, available: 6, reserved: 0, ordered: 4, onOrder: 10 }],
  timestamp: '10:36:41'
};

// Toolbar popup demo state, rendered the way popup.js renders it.
const POPUP_DEMO = {
  summary: 'Showing 5 quantity columns, 20 product fields.',
  today: 23, total: 486,
  logs: [
    { ok: true, item: 'FG-10421', time: '10:24:07', details: '12 product fields',
      url: `https://${ENV}/data/ReleasedProductsV2?cross-company=true&$top=10&$select=dataAreaId,ItemNumber,InventoryUnitSymbol,ItemModelGroupId,TrackingDimensionGroupName,...&$filter=ItemNumber eq 'FG-10421' and dataAreaId eq 'usmf'`,
      raw: '{"value":[{"dataAreaId":"usmf","ItemNumber":"FG-10421","InventoryUnitSymbol":"pcs","ItemModelGroupId":"FIFO","TrackingDimensionGroupName":"BATCH", ...}]}' },
    { ok: true, item: 'FG-10421', time: '10:24:07', details: '3 warehouses',
      url: `https://${ENV}/data/WarehousesOnHandV2?cross-company=true&$filter=ItemNumber eq 'FG-10421' and dataAreaId eq 'usmf'`,
      raw: '{\n  "value": [\n    {\n      "dataAreaId": "usmf",\n      "ItemNumber": "FG-10421",\n      "InventoryWarehouseId": "WH01",\n      "OnHandQuantity": 1240,\n      "AvailableOnHandQuantity": 1086,\n      "ReservedOnHandQuantity": 154,\n      "OrderedQuantity": 600,\n      "OnOrderQuantity": 0\n    }, ...\n  ]\n}' },
    { ok: true, item: 'PK-30102', time: '10:31:44', details: '1 warehouse', url: 'x', raw: 'x' },
    { ok: true, item: 'EQ-50210', time: '10:36:41', details: '3 warehouses', url: 'x', raw: 'x' },
    { ok: true, item: 'ReleasedProductsV2', time: '08:58:12', details: '284 fields discovered', url: 'x', raw: 'x' }
  ]
};

// The options page's field picker, rendered the way options.js renders it.
const OPTION_FIELDS = {
  available: [
    ['Coverage group', 'ProductCoverageGroupId', 'Text', true], ['Cost group', 'CostGroupId', 'Text', true],
    ['Gross depth', 'GrossDepth', 'Number', false], ['Gross product height', 'GrossProductHeight', 'Number', false],
    ['Item group', 'ItemGroupId', 'Text', false], ['Net product weight', 'NetProductWeight', 'Number', false],
    ['Primary vendor', 'PrimaryVendorAccountNumber', 'Text', true], ['Product lifecycle state', 'ProductLifecycleStateId', 'Text', false],
    ['Roast level', 'CTSRoastLevel', 'Text', false], ['Sell start date', 'SellStartDate', 'Date', false],
    ['Shelf life period in days', 'ShelfLifePeriodDays', 'Number', false], ['Storage dimension group', 'StorageDimensionGroupName', 'Text', false]
  ],
  selected: [
    ['Inventory unit', 'InventoryUnitSymbol'], ['Item model group', 'ItemModelGroupId'], ['Tracking dimension group', 'TrackingDimensionGroupName'],
    ['Reservation hierarchy', 'InventoryReservationHierarchyName'], ['Coverage group', 'ProductCoverageGroupId'], ['Production type', 'ProductionType'],
    ['Cost group', 'CostGroupId'], ['Filter code 1', 'FirstProductFilterCode'], ['Filter code 2', 'SecondProductFilterCode'],
    ['Filter code 3', 'ThirdProductFilterCode'], ['Filter code 4', 'FourthProductFilterCode'], ['Filter code 5', 'FifthProductFilterCode'],
    ['Filter code 6', 'SixthProductFilterCode'], ['Filter code 7', 'SeventhProductFilterCode'], ['Filter code 8', 'EighthProductFilterCode'],
    ['Filter code 9', 'NinthProductFilterCode'], ['Filter code 10', 'TenthProductFilterCode'], ['Primary vendor', 'PrimaryVendorAccountNumber'],
    ['Tax group', 'SalesSalesTaxItemGroupCode'], ['Unit sequence group', 'UnitConversionSequenceGroupId']
  ]
};

// Field names streamed in the "first hover discovers your fields" beat. The
// CTS* ones stand in for a customer's own extension fields.
const DISCOVERED_FIELDS = [
  ['ItemNumber', false], ['SearchName', false], ['InventoryUnitSymbol', false], ['ItemModelGroupId', false],
  ['TrackingDimensionGroupName', false], ['ProductCoverageGroupId', false], ['CostGroupId', false], ['ProductionType', false],
  ['CTSRoastLevel', true], ['CTSOriginCountry', true], ['CTSOrganicCertified', true], ['PrimaryVendorAccountNumber', false],
  ['SalesSalesTaxItemGroupCode', false], ['UnitConversionSequenceGroupId', false]
];
