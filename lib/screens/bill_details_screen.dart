import 'package:flutter/material.dart';
import '../models/bill.dart';
import '../utils/currency_formatter.dart';
import '../widgets/bill_item_tile.dart';
import 'invoice_preview_screen.dart';

class BillDetailsScreen extends StatelessWidget {
  final Bill bill;

  const BillDetailsScreen({super.key, required this.bill});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text('Bill Details: ${bill.billNumber}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.receipt_long),
            tooltip: 'View Invoice',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => InvoicePreviewScreen(bill: bill),
                ),
              );
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header Card
          Card(
            elevation: 0,
            color: theme.colorScheme.primaryContainer.withOpacity(0.5),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        bill.billNumber,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.green.shade100,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          bill.paymentMethod.displayName,
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.green.shade900,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Created: ${CurrencyFormatter.formatDate(bill.createdAt)}'),
                      Text('Cashier: ${bill.cashierName}'),
                    ],
                  ),
                  if (bill.customerName != null || bill.customerPhone != null) ...[
                    const Divider(height: 16),
                    Row(
                      children: [
                        const Icon(Icons.person, size: 16),
                        const SizedBox(width: 8),
                        Text(
                          'Customer: ${bill.customerName ?? "Walk-in"}${bill.customerPhone != null ? " • ${bill.customerPhone}" : ""}',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          Text(
            'Billed Items (${bill.items.length})',
            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),

          // Items list
          ...bill.items.map((item) {
            return BillItemTile(
              item: item,
              isEditable: false,
            );
          }),

          const SizedBox(height: 16),

          // Financial Summary Card
          Card(
            elevation: 0,
            color: theme.colorScheme.surfaceVariant.withOpacity(0.3),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(color: theme.colorScheme.outlineVariant.withOpacity(0.5)),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _summaryRow('Subtotal', CurrencyFormatter.format(bill.subtotal)),
                  if (bill.discountAmount > 0)
                    _summaryRow(
                      'Discount Applied',
                      '- ${CurrencyFormatter.format(bill.discountAmount)}',
                      textColor: Colors.red.shade700,
                    ),
                  if (bill.taxAmount > 0)
                    _summaryRow('Tax (GST)', CurrencyFormatter.format(bill.taxAmount))
                  else
                    _summaryRow('Tax (GST)', 'None (0%)', textColor: Colors.grey.shade600),
                  const Divider(height: 16),
                  _summaryRow(
                    'Grand Total',
                    CurrencyFormatter.format(bill.grandTotal),
                    isBold: true,
                    fontSize: 20,
                    textColor: theme.colorScheme.primary,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          FilledButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => InvoicePreviewScreen(bill: bill),
                ),
              );
            },
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(Icons.receipt_long),
            label: const Text(
              'View & Print Tax Invoice',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  Widget _summaryRow(
    String label,
    String value, {
    bool isBold = false,
    double? fontSize,
    Color? textColor,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.black54, fontSize: fontSize)),
          Text(
            value,
            style: TextStyle(
              fontWeight: isBold ? FontWeight.bold : FontWeight.w600,
              fontSize: fontSize ?? 15,
              color: textColor,
            ),
          ),
        ],
      ),
    );
  }
}
