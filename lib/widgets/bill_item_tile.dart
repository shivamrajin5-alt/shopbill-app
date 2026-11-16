import 'package:flutter/material.dart';
import '../models/bill_item.dart';
import '../models/item.dart';
import '../utils/currency_formatter.dart';

class BillItemTile extends StatelessWidget {
  final BillItem item;
  final VoidCallback? onIncrement;
  final VoidCallback? onDecrement;
  final VoidCallback? onEditQuantity;
  final VoidCallback? onEditPrice;
  final VoidCallback? onDelete;
  final bool isEditable;

  const BillItemTile({
    super.key,
    required this.item,
    this.onIncrement,
    this.onDecrement,
    this.onEditQuantity,
    this.onEditPrice,
    this.onDelete,
    this.isEditable = true,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unitSuffix = item.unit == ItemUnit.kg ? '/kg' : 'each';

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
      elevation: 0,
      color: theme.colorScheme.surfaceVariant.withOpacity(0.35),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: theme.colorScheme.outlineVariant.withOpacity(0.5)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.name,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (item.unit == ItemUnit.kg)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.amber.shade100,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            'WEIGHT',
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                              color: Colors.amber.shade900,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text(
                        'Code: ${item.code}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(width: 12),
                      InkWell(
                        onTap: isEditable ? onEditPrice : null,
                        borderRadius: BorderRadius.circular(4),
                        child: Row(
                          children: [
                            Text(
                              '@ ${CurrencyFormatter.format(item.unitPrice)} $unitSuffix',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.primary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            if (isEditable) ...[
                              const SizedBox(width: 4),
                              Icon(
                                Icons.edit,
                                size: 12,
                                color: theme.colorScheme.primary,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (isEditable) ...[
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton.filledTonal(
                    visualDensity: VisualDensity.compact,
                    iconSize: 18,
                    onPressed: onDecrement,
                    icon: const Icon(Icons.remove),
                  ),
                  InkWell(
                    onTap: onEditQuantity,
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        item.formattedQuantity,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                    ),
                  ),
                  IconButton.filledTonal(
                    visualDensity: VisualDensity.compact,
                    iconSize: 18,
                    onPressed: onIncrement,
                    icon: const Icon(Icons.add),
                  ),
                ],
              ),
              const SizedBox(width: 8),
            ] else ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceVariant,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  item.formattedQuantity,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 16),
            ],
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  CurrencyFormatter.format(item.totalPrice),
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.primary,
                  ),
                ),
                if (isEditable && onDelete != null)
                  InkWell(
                    onTap: onDelete,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        'Remove',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.error,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
