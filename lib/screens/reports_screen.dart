import 'package:flutter/material.dart';
import '../data/shop_repository.dart';
import '../models/bill.dart';
import '../utils/currency_formatter.dart';
import '../widgets/stat_card.dart';

enum ReportPeriod { daily, weekly, monthly, custom }

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  ReportPeriod _period = ReportPeriod.daily;
  DateTime _customStartDate = DateTime.now().subtract(const Duration(days: 7));
  DateTime _customEndDate = DateTime.now();

  (DateTime, DateTime) _getDateRange() {
    final now = DateTime.now();
    switch (_period) {
      case ReportPeriod.daily:
        final start = DateTime(now.year, now.month, now.day);
        final end = DateTime(now.year, now.month, now.day, 23, 59, 59);
        return (start, end);
      case ReportPeriod.weekly:
        final monday = now.subtract(Duration(days: now.weekday - 1));
        final start = DateTime(monday.year, monday.month, monday.day);
        final end = DateTime(now.year, now.month, now.day, 23, 59, 59);
        return (start, end);
      case ReportPeriod.monthly:
        final start = DateTime(now.year, now.month, 1);
        final end = DateTime(now.year, now.month, now.day, 23, 59, 59);
        return (start, end);
      case ReportPeriod.custom:
        final start = DateTime(
          _customStartDate.year,
          _customStartDate.month,
          _customStartDate.day,
        );
        final end = DateTime(
          _customEndDate.year,
          _customEndDate.month,
          _customEndDate.day,
          23,
          59,
          59,
        );
        return (start, end);
    }
  }

  Future<void> _pickCustomDateRange() async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      initialDateRange: DateTimeRange(start: _customStartDate, end: _customEndDate),
    );

    if (picked != null) {
      setState(() {
        _customStartDate = picked.start;
        _customEndDate = picked.end;
        _period = ReportPeriod.custom;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final repo = ShopRepository.instance;

    return ListenableBuilder(
      listenable: repo,
      builder: (context, _) {
        final (startDate, endDate) = _getDateRange();
        final report = repo.getReportForRange(start: startDate, end: endDate);

        return Scaffold(
          appBar: AppBar(
            title: const Text('Sales Reports'),
          ),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Period Filter Selector
              SegmentedButton<ReportPeriod>(
                segments: const [
                  ButtonSegment(value: ReportPeriod.daily, label: Text('Today')),
                  ButtonSegment(value: ReportPeriod.weekly, label: Text('Week')),
                  ButtonSegment(value: ReportPeriod.monthly, label: Text('Month')),
                  ButtonSegment(value: ReportPeriod.custom, label: Text('Custom')),
                ],
                selected: {_period},
                onSelectionChanged: (val) {
                  if (val.first == ReportPeriod.custom) {
                    _pickCustomDateRange();
                  } else {
                    setState(() => _period = val.first);
                  }
                },
              ),
              const SizedBox(height: 12),

              // Active Date Range Label
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.calendar_today, size: 14, color: theme.colorScheme.primary),
                  const SizedBox(width: 6),
                  Text(
                    '${CurrencyFormatter.formatDateShort(startDate)} — ${CurrencyFormatter.formatDateShort(endDate)}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  if (_period == ReportPeriod.custom) ...[
                    const SizedBox(width: 8),
                    InkWell(
                      onTap: _pickCustomDateRange,
                      child: Text(
                        '(Change)',
                        style: TextStyle(
                          fontSize: 12,
                          color: theme.colorScheme.secondary,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 16),

              // KPI Stat Cards Grid
              Row(
                children: [
                  Expanded(
                    child: StatCard(
                      title: 'Total Sales',
                      value: CurrencyFormatter.format(report.totalSales),
                      icon: Icons.payments_outlined,
                      color: Colors.green.shade700,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: StatCard(
                      title: 'Total Bills',
                      value: '${report.totalBills}',
                      icon: Icons.receipt_long,
                      color: Colors.blue.shade700,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: StatCard(
                      title: 'Quantity Sold',
                      value: '${report.totalItemsSold.toStringAsFixed(report.totalItemsSold.truncateToDouble() == report.totalItemsSold ? 0 : 2)} units',
                      icon: Icons.shopping_bag_outlined,
                      color: Colors.orange.shade800,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: StatCard(
                      title: 'Total Discounts',
                      value: CurrencyFormatter.format(report.totalDiscount),
                      icon: Icons.discount_outlined,
                      color: Colors.purple.shade700,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Payment Method Breakdown
              Card(
                elevation: 0,
                color: theme.colorScheme.surfaceVariant.withOpacity(0.35),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: theme.colorScheme.outlineVariant.withOpacity(0.5)),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.pie_chart_outline, color: theme.colorScheme.primary),
                          const SizedBox(width: 8),
                          Text(
                            'Payment Method Breakdown',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      ...PaymentMethod.values.map((pm) {
                        final amt = report.paymentBreakdown[pm] ?? 0.0;
                        final pct = report.totalSales > 0 ? (amt / report.totalSales) : 0.0;
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    pm.displayName,
                                    style: const TextStyle(fontWeight: FontWeight.w600),
                                  ),
                                  Text(
                                    '${CurrencyFormatter.format(amt)} (${(pct * 100).toStringAsFixed(1)}%)',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: theme.colorScheme.primary,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              LinearProgressIndicator(
                                value: pct,
                                borderRadius: BorderRadius.circular(4),
                                minHeight: 6,
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Top Selling Items
              Card(
                elevation: 0,
                color: theme.colorScheme.surfaceVariant.withOpacity(0.35),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: theme.colorScheme.outlineVariant.withOpacity(0.5)),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.leaderboard_outlined, color: theme.colorScheme.primary),
                          const SizedBox(width: 8),
                          Text(
                            'Top-Selling Items',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      if (report.topSellingItems.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 12.0),
                          child: Text('No item sales in this period.'),
                        )
                      else
                        ...report.topSellingItems.asMap().entries.map((entry) {
                          final rank = entry.key + 1;
                          final item = entry.value;
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: CircleAvatar(
                              radius: 14,
                              backgroundColor: rank == 1
                                  ? Colors.amber.shade200
                                  : theme.colorScheme.surfaceVariant,
                              child: Text(
                                '$rank',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                  color: rank == 1 ? Colors.amber.shade900 : null,
                                ),
                              ),
                            ),
                            title: Text(
                              item.key,
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                            trailing: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.primaryContainer,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                '${item.value.toStringAsFixed(item.value.truncateToDouble() == item.value ? 0 : 2)} sold',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: theme.colorScheme.onPrimaryContainer,
                                ),
                              ),
                            ),
                          );
                        }),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
