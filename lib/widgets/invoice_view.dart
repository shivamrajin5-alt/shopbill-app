import 'package:flutter/material.dart';
import '../models/bill.dart';
import '../data/shop_repository.dart';
import '../utils/currency_formatter.dart';

class InvoiceView extends StatelessWidget {
  final Bill bill;

  const InvoiceView({super.key, required this.bill});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final profile = ShopRepository.instance.profile;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          Center(
            child: Column(
              children: [
                Text(
                  profile.name.toUpperCase(),
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.2,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  profile.tagline,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: Colors.black54,
                    fontStyle: FontStyle.italic,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  profile.address,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(color: Colors.black54),
                ),
                Text(
                  'Phone: ${profile.phone}',
                  style: theme.textTheme.bodySmall?.copyWith(color: Colors.black54),
                ),
                if (profile.gstin.isNotEmpty)
                  Text(
                    'GSTIN: ${profile.gstin}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: Colors.black87,
                    ),
                  ),
              ],
            ),
          ),

          const SizedBox(height: 16),
          const Divider(thickness: 1, color: Colors.black26),
          const SizedBox(height: 8),

          // Metadata Row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Bill No: ${bill.billNumber}',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Colors.black87,
                    ),
                  ),
                  Text(
                    'Date: ${CurrencyFormatter.formatDate(bill.createdAt)}',
                    style: theme.textTheme.bodySmall?.copyWith(color: Colors.black54),
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.green.shade50,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.parseBorder(Border.all(color: Colors.green.shade300)),
                    ),
                    child: Text(
                      'PAID: ${bill.paymentMethod.displayName}',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Colors.green.shade800,
                      ),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Cashier: ${bill.cashierName}',
                    style: theme.textTheme.bodySmall?.copyWith(color: Colors.black54),
                  ),
                ],
              ),
            ],
          ),

          if (bill.customerName != null || bill.customerPhone != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                children: [
                  const Icon(Icons.person, size: 14, color: Colors.black54),
                  const SizedBox(width: 6),
                  Text(
                    'Customer: ${bill.customerName ?? "Walk-in"}${bill.customerPhone != null ? " (${bill.customerPhone})" : ""}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w500,
                      color: Colors.black87,
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 12),
          const Divider(thickness: 1, color: Colors.black26),

          // Table Header
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                Expanded(
                  flex: 5,
                  child: Text(
                    'ITEM',
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Colors.black87,
                    ),
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    'QTY',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Colors.black87,
                    ),
                  ),
                ),
                Expanded(
                  flex: 3,
                  child: Text(
                    'PRICE',
                    textAlign: TextAlign.right,
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Colors.black87,
                    ),
                  ),
                ),
                Expanded(
                  flex: 3,
                  child: Text(
                    'TOTAL',
                    textAlign: TextAlign.right,
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Colors.black87,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Divider(thickness: 1, color: Colors.black12),

          // Table Items
          ...bill.items.map((it) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Expanded(
                    flex: 5,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          it.name,
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: Colors.black87,
                          ),
                        ),
                        Text(
                          it.code,
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontSize: 10,
                            color: Colors.black54,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    flex: 2,
                    child: Text(
                      it.formattedQuantity,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall?.copyWith(color: Colors.black87),
                    ),
                  ),
                  Expanded(
                    flex: 3,
                    child: Text(
                      CurrencyFormatter.format(it.unitPrice),
                      textAlign: TextAlign.right,
                      style: theme.textTheme.bodySmall?.copyWith(color: Colors.black87),
                    ),
                  ),
                  Expanded(
                    flex: 3,
                    child: Text(
                      CurrencyFormatter.format(it.totalPrice),
                      textAlign: TextAlign.right,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: Colors.black87,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),

          const SizedBox(height: 8),
          const Divider(thickness: 1, color: Colors.black26),

          // Summary
          _buildSummaryRow(context, 'Subtotal', CurrencyFormatter.format(bill.subtotal)),
          if (bill.discountAmount > 0)
            _buildSummaryRow(
              context,
              'Discount',
              '- ${CurrencyFormatter.format(bill.discountAmount)}',
              valueColor: Colors.red.shade700,
            ),
          if (bill.taxAmount > 0)
            _buildSummaryRow(
              context,
              'Tax (GST)',
              CurrencyFormatter.format(bill.taxAmount),
            ),
          const Divider(thickness: 1, color: Colors.black45),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'GRAND TOTAL',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.black,
                  ),
                ),
                Text(
                  CurrencyFormatter.format(bill.grandTotal),
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.green.shade800,
                  ),
                ),
              ],
            ),
          ),
          const Divider(thickness: 1, color: Colors.black45),

          const SizedBox(height: 16),
          Center(
            child: Column(
              children: [
                Text(
                  'Thank you for shopping with us!',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Computer generated invoice • No signature required',
                  style: theme.textTheme.labelSmall?.copyWith(color: Colors.black45),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryRow(
    BuildContext context,
    String label,
    String value, {
    Color? valueColor,
  }) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(color: Colors.black54),
          ),
          Text(
            value,
            style: theme.textTheme.bodySmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: valueColor ?? Colors.black87,
            ),
          ),
        ],
      ),
    );
  }
}
