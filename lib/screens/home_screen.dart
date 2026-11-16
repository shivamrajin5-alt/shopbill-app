import 'package:flutter/material.dart';
import '../data/shop_repository.dart';
import '../models/bill.dart';
import '../utils/currency_formatter.dart';
import '../widgets/stat_card.dart';
import 'new_bill_screen.dart';
import 'items_screen.dart';
import 'bills_screen.dart';
import 'bill_details_screen.dart';
import 'reports_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final repo = ShopRepository.instance;

    return ListenableBuilder(
      listenable: repo,
      builder: (context, _) {
        final profile = repo.profile;
        final user = repo.currentUser;

        // Calculate today's stats
        final now = DateTime.now();
        final startOfToday = DateTime(now.year, now.month, now.day);
        final endOfToday = DateTime(now.year, now.month, now.day, 23, 59, 59);
        final todayReport = repo.getReportForRange(start: startOfToday, end: endOfToday);
        final recentBills = repo.bills.take(5).toList();

        return Scaffold(
          appBar: AppBar(
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile.name,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                ),
                Text(
                  '${user?.name ?? "Staff"} • ${user?.roleDisplayName ?? ""}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.settings_outlined),
                tooltip: 'Settings',
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const SettingsScreen()),
                  );
                },
              ),
            ],
          ),
          body: RefreshIndicator(
            onRefresh: () async {},
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              children: [
                // Quick New Bill Hero Banner
                Card(
                  elevation: 0,
                  color: theme.colorScheme.primaryContainer,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: InkWell(
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const NewBillScreen()),
                      );
                    },
                    borderRadius: BorderRadius.circular(20),
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.primary,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.point_of_sale_rounded,
                              color: Colors.white,
                              size: 32,
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Create New Bill',
                                  style: theme.textTheme.titleLarge?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: theme.colorScheme.onPrimaryContainer,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Add items, apply discounts & print invoice',
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: theme.colorScheme.onPrimaryContainer.withOpacity(0.8),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Icon(
                            Icons.arrow_forward_ios_rounded,
                            color: theme.colorScheme.onPrimaryContainer,
                            size: 18,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 20),

                // Today's Stats Row
                Row(
                  children: [
                    Expanded(
                      child: StatCard(
                        title: "Today's Sales",
                        value: CurrencyFormatter.format(todayReport.totalSales),
                        icon: Icons.currency_rupee,
                        color: Colors.green.shade700,
                        subtitle: '${todayReport.totalItemsSold} items sold',
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: StatCard(
                        title: "Today's Bills",
                        value: '${todayReport.totalBills}',
                        icon: Icons.receipt_long,
                        color: Colors.blue.shade700,
                        subtitle: 'Invoices created',
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // Quick Navigation Grid
                Text(
                  'Quick Management',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.5,
                  children: [
                    _buildNavCard(
                      context,
                      title: 'Items & Stock',
                      subtitle: '${repo.items.length} items',
                      icon: Icons.inventory_2_outlined,
                      color: Colors.deepPurple,
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const ItemsScreen()),
                        );
                      },
                    ),
                    _buildNavCard(
                      context,
                      title: 'Bills History',
                      subtitle: '${repo.bills.length} total bills',
                      icon: Icons.history_rounded,
                      color: Colors.teal,
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const BillsScreen()),
                        );
                      },
                    ),
                    _buildNavCard(
                      context,
                      title: 'Sales Reports',
                      subtitle: 'Daily & monthly',
                      icon: Icons.analytics_outlined,
                      color: Colors.amber.shade900,
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const ReportsScreen()),
                        );
                      },
                    ),
                    _buildNavCard(
                      context,
                      title: 'Settings',
                      subtitle: 'Shop & tax profile',
                      icon: Icons.storefront_outlined,
                      color: Colors.indigo,
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const SettingsScreen()),
                        );
                      },
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // Recent Bills Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Recent Bills',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    TextButton(
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const BillsScreen()),
                        );
                      },
                      child: const Text('View All'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                if (recentBills.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Center(
                      child: Text(
                        'No bills created yet. Tap "Create New Bill" above!',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  )
                else
                  ...recentBills.map((b) => _buildRecentBillTile(context, b)),
              ],
            ),
          ),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const NewBillScreen()),
              );
            },
            icon: const Icon(Icons.add_shopping_cart),
            label: const Text('New Bill'),
          ),
        );
      },
    );
  }

  Widget _buildNavCard(
    BuildContext context, {
    required String title,
    required String subtitle,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      color: theme.colorScheme.surfaceVariant.withOpacity(0.35),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: theme.colorScheme.outlineVariant.withOpacity(0.5)),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color, size: 22),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRecentBillTile(BuildContext context, Bill bill) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 8),
      color: theme.colorScheme.surfaceVariant.withOpacity(0.25),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: theme.colorScheme.outlineVariant.withOpacity(0.4)),
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
          child: Icon(
            Icons.receipt_outlined,
            color: theme.colorScheme.onPrimaryContainer,
            size: 20,
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
        subtitle: Text(
          '${bill.customerName ?? "Walk-in"} • ${CurrencyFormatter.formatDateShort(bill.createdAt)}',
          style: theme.textTheme.bodySmall,
        ),
        trailing: Text(
          CurrencyFormatter.format(bill.grandTotal),
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
            color: theme.colorScheme.primary,
          ),
        ),
      ),
    );
  }
}
