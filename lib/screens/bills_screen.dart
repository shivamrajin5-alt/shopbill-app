import 'package:flutter/material.dart';
import '../data/shop_repository.dart';
import '../models/bill.dart';
import '../utils/currency_formatter.dart';
import 'bill_details_screen.dart';

class BillsScreen extends StatefulWidget {
  const BillsScreen({super.key});

  @override
  State<BillsScreen> createState() => _BillsScreenState();
}

class _BillsScreenState extends State<BillsScreen> {
  final _searchController = TextEditingController();
  PaymentMethod? _filterPayment;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final repo = ShopRepository.instance;

    return ListenableBuilder(
      listenable: repo,
      builder: (context, _) {
        final allBills = repo.bills;
        final query = _searchController.text.trim().toLowerCase();

        final filtered = allBills.where((b) {
          final matchesQuery = query.isEmpty ||
              b.billNumber.toLowerCase().contains(query) ||
              (b.customerName?.toLowerCase().contains(query) ?? false) ||
              b.cashierName.toLowerCase().contains(query);
          final matchesPayment =
              _filterPayment == null || b.paymentMethod == _filterPayment;
          return matchesQuery && matchesPayment;
        }).toList();

        final totalAmount = filtered.fold(0.0, (sum, b) => sum + b.grandTotal);

        return Scaffold(
          appBar: AppBar(
            title: const Text('Bills History'),
          ),
          body: Column(
            children: [
              // Search & Filter
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: SearchBar(
                  controller: _searchController,
                  leading: const Icon(Icons.search),
                  hintText: 'Search bill #, customer, cashier...',
                  elevation: const WidgetStatePropertyAll(0),
                  backgroundColor: WidgetStatePropertyAll(
                    theme.colorScheme.surfaceVariant.withOpacity(0.5),
                  ),
                  trailing: [
                    if (_searchController.text.isNotEmpty)
                      IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          setState(() {
                            _searchController.clear();
                          });
                        },
                      ),
                  ],
                  onChanged: (_) => setState(() {}),
                ),
              ),

              // Payment Filter Chips
              SizedBox(
                height: 44,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    FilterChip(
                      selected: _filterPayment == null,
                      label: const Text('All Payment'),
                      onSelected: (_) => setState(() => _filterPayment = null),
                    ),
                    const SizedBox(width: 8),
                    ...PaymentMethod.values.map((pm) {
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterChip(
                          selected: _filterPayment == pm,
                          label: Text(pm.displayName),
                          onSelected: (_) => setState(() => _filterPayment = pm),
                        ),
                      );
                    }),
                  ],
                ),
              ),
              const SizedBox(height: 8),

              // Summary Banner
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                color: theme.colorScheme.surfaceVariant.withOpacity(0.3),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${filtered.length} Bills found',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    Text(
                      'Total: ${CurrencyFormatter.format(totalAmount)}',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                  ],
                ),
              ),

              // Bills List
              Expanded(
                child: filtered.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.receipt_long_outlined,
                              size: 56,
                              color: theme.colorScheme.outline,
                            ),
                            const SizedBox(height: 12),
                            Text('No bills found', style: theme.textTheme.titleMedium),
                            const SizedBox(height: 4),
                            Text(
                              'Try clearing your search query or filter',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(12),
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 4),
                        itemBuilder: (context, index) {
                          final bill = filtered[index];
                          return Card(
                            elevation: 0,
                            color: theme.colorScheme.surfaceVariant.withOpacity(0.3),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                              side: BorderSide(
                                color: theme.colorScheme.outlineVariant.withOpacity(0.4),
                              ),
                            ),
                            child: ListTile(
                              onTap: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => BillDetailsScreen(bill: bill),
                                  ),
                                );
                              },
                              leading: CircleAvatar(
                                backgroundColor: theme.colorScheme.primaryContainer,
                                child: Text(
                                  '#${bill.billNumber.replaceAll(RegExp(r'[^0-9]'), '')}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: theme.colorScheme.onPrimaryContainer,
                                  ),
                                ),
                              ),
                              title: Row(
                                children: [
                                  Text(
                                    bill.billNumber,
                                    style: const TextStyle(fontWeight: FontWeight.bold),
                                  ),
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: Colors.green.shade50,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      bill.paymentMethod.displayName,
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.green.shade800,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              subtitle: Padding(
                                padding: const EdgeInsets.only(top: 4.0),
                                child: Text(
                                  '${bill.customerName ?? "Walk-in"} • ${bill.totalItemsCount} items\n${CurrencyFormatter.formatDate(bill.createdAt)}',
                                  style: theme.textTheme.bodySmall,
                                ),
                              ),
                              isThreeLine: true,
                              trailing: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    CurrencyFormatter.format(bill.grandTotal),
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: theme.colorScheme.primary,
                                      fontSize: 16,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    bill.cashierName,
                                    style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}
