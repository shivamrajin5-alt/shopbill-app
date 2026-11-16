import 'package:flutter/material.dart';
import '../models/bill.dart';
import '../utils/currency_formatter.dart';
import 'invoice_preview_screen.dart';
import 'new_bill_screen.dart';
import 'home_screen.dart';

class BillSuccessScreen extends StatelessWidget {
  final Bill bill;

  const BillSuccessScreen({super.key, required this.bill});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(28.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.green.shade200, width: 2),
                      ),
                      child: Icon(
                        Icons.check_circle_rounded,
                        color: Colors.green.shade700,
                        size: 72,
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Bill Created Successfully!',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Invoice #${bill.billNumber}',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Summary Card
                  Card(
                    elevation: 0,
                    color: theme.colorScheme.surfaceVariant.withOpacity(0.4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: BorderSide(
                        color: theme.colorScheme.outlineVariant.withOpacity(0.5),
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(20.0),
                      child: Column(
                        children: [
                          _buildRow('Grand Total', CurrencyFormatter.format(bill.grandTotal), isBold: true),
                          const Divider(height: 16),
                          _buildRow('Payment Mode', bill.paymentMethod.displayName),
                          _buildRow('Total Items', '${bill.totalItemsCount} (${bill.items.length} products)'),
                          _buildRow('Date & Time', CurrencyFormatter.formatDate(bill.createdAt)),
                          if (bill.customerName != null)
                            _buildRow('Customer', bill.customerName!),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Action Buttons
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
                      'View / Print Invoice',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(height: 12),

                  FilledButton.tonalIcon(
                    onPressed: () {
                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(builder: (_) => const NewBillScreen()),
                      );
                    },
                    style: FilledButton.tonalStyleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.add_shopping_cart),
                    label: const Text(
                      'Create Another Bill',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(height: 8),

                  TextButton.icon(
                    onPressed: () {
                      Navigator.of(context).pushAndRemoveUntil(
                        MaterialPageRoute(builder: (_) => const HomeScreen()),
                        (route) => false,
                      );
                    },
                    icon: const Icon(Icons.home_outlined),
                    label: const Text('Back to Home'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildRow(String label, String value, {bool isBold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.black54)),
          Text(
            value,
            style: TextStyle(
              fontWeight: isBold ? FontWeight.bold : FontWeight.w500,
              fontSize: isBold ? 18 : 14,
            ),
          ),
        ],
      ),
    );
  }
}
