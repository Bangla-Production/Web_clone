// Shared helpers for the "download Excel backup" feature (Settings + Reports).

export const pad = (n) => String(n).padStart(2, '0');
export const toInputDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const recordDate = (data) => {
  const raw = data.createdAt?.toDate ? data.createdAt.toDate() : (data.issuedAt ? new Date(data.issuedAt) : null);
  if (!raw || Number.isNaN(raw.getTime())) return '';
  return `${toInputDate(raw)} ${pad(raw.getHours())}:${pad(raw.getMinutes())}:${pad(raw.getSeconds())}`;
};

const itemsText = (items) => (items || []).map((i) => `${i.quantity} x ${i.name}`).join('; ');
const byDate = (a, b) => recordDate(a.data).localeCompare(recordDate(b.data));

/**
 * Builds the Excel sheets from a previewOldRecords() result.
 * The backup always contains EVERY order/ticket/invoice that was read
 * (a superset of what a cleanup deletes), so nothing deleted is missing here.
 */
export function buildBackupSheets(preview, upToLabel) {
  const orders = [...(preview.allOrders || preview.orders)].sort(byDate);
  const kots = [...(preview.allKots || preview.kots)].sort(byDate);
  const invoices = [...preview.invoices].sort(byDate);

  const totalSales = invoices.reduce((sum, { data }) => sum + (Number(data.totalAmount) || 0), 0);
  const byMethod = {};
  invoices.forEach(({ data }) => {
    const m = data.paymentMethod || 'UNKNOWN';
    byMethod[m] = (byMethod[m] || 0) + (Number(data.totalAmount) || 0);
  });
  const countStatus = (status) => orders.filter(({ data }) => data.orderStatus === status).length;

  const summary = [
    ['Item', 'Value'],
    ['Backup created', recordDate({ createdAt: { toDate: () => new Date() } })],
    ['Data up to', upToLabel],
    ['Orders (all)', orders.length],
    ['  Closed / paid', orders.filter(({ data }) => data.paymentStatus === 'PAID').length],
    ['  Cancelled', countStatus('CANCELLED')],
    ['  Still open (NOT deleted by cleanup)', orders.filter(({ data }) => !(data.paymentStatus === 'PAID' || ['CLOSED', 'CANCELLED'].includes(data.orderStatus))).length],
    ['Kitchen tickets', kots.length],
    ['Invoices', invoices.length],
    ['Total sales (invoices)', totalSales],
    ...Object.entries(byMethod).map(([method, amount]) => [`  Sales - ${method}`, amount])
  ];

  const orderRows = [
    ['Order No', 'Date', 'Type', 'Table', 'Waiter', 'Customer', 'Phone', 'Items', 'Subtotal',
      'Discount', 'Tax', 'Total', 'Payment Status', 'Payment Method', 'Order Status', 'Invoice No', 'Notes'],
    ...orders.map(({ data: d }) => [
      d.orderNumber, recordDate(d), d.orderType, d.tableNumber, d.waiterName, d.customerName, d.customerPhone,
      itemsText(d.items), d.subtotal, d.discountAmount, d.taxAmount, d.totalAmount,
      d.paymentStatus, d.paymentMethod, d.orderStatus, d.invoiceNumber, d.orderNotes
    ])
  ];

  const itemRows = [['Order No', 'Date', 'Item', 'Qty', 'Price', 'Item Total', 'Notes']];
  orders.forEach(({ data: d }) => {
    (d.items || []).forEach((i) => {
      itemRows.push([d.orderNumber, recordDate(d), i.name, i.quantity, i.price, i.itemTotal, i.notes]);
    });
  });

  const kotRows = [
    ['KOT No', 'Order No', 'Date', 'Table', 'Waiter', 'Status', 'Items', 'Notes'],
    ...kots.map(({ data: d }) => [
      d.kotNumber, d.orderNumber, recordDate(d), d.tableNumber, d.waiterName, d.status,
      itemsText(d.items), d.orderNotes
    ])
  ];

  const invoiceRows = [
    ['Invoice No', 'Date', 'Order No', 'Type', 'Table', 'Waiter', 'Customer', 'Phone', 'Items',
      'Subtotal', 'Discount', 'Tax', 'Total', 'Payment Method', 'Billed By'],
    ...invoices.map(({ data: d }) => [
      d.invoiceNumber, recordDate(d), d.orderNumber, d.orderType, d.tableNumber, d.waiterName,
      d.customerName, d.customerPhone, itemsText(d.items),
      d.subtotal, d.discountAmount, d.taxAmount, d.totalAmount, d.paymentMethod, d.billedBy
    ])
  ];

  return [
    { name: 'Summary', rows: summary },
    { name: 'Invoices', rows: invoiceRows },
    { name: 'Orders', rows: orderRows },
    { name: 'Order Items', rows: itemRows },
    { name: 'Kitchen Tickets', rows: kotRows }
  ];
}

export const daysSince = (date) =>
  date ? Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)) : null;
