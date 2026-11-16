import 'package:flutter/material.dart';
import '../models/bill.dart';
import '../widgets/invoice_view.dart';

class InvoicePreviewScreen extends StatelessWidget {
  final Bill bill;

  const InvoicePreviewScreen({super.key, required this.bill});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      appBar: AppBar(
        title: Text('Invoice ${bill.billNumber}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share_outlined),
            tooltip: 'Share Receipt',
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Receipt shared (in-memory demo).')),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.print_outlined),
            tooltip: 'Print Receipt',
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Print job sent (printer disabled as requested).')),
              );
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              children: [
                InvoiceView(bill: bill),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.done),
                  label: const Text('Done'),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
