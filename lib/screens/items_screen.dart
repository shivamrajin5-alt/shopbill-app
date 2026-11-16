import 'package:flutter/material.dart';
import '../data/shop_repository.dart';
import '../models/item.dart';
import '../utils/currency_formatter.dart';
import 'add_edit_item_screen.dart';

class ItemsScreen extends StatefulWidget {
  const ItemsScreen({super.key});

  @override
  State<ItemsScreen> createState() => _ItemsScreenState();
}

class _ItemsScreenState extends State<ItemsScreen> {
  final _searchController = TextEditingController();
  String _selectedCategory = 'All';

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
        final allItems = repo.items;
        final categories = [
          'All',
          ...{for (final item in allItems) item.category}
        ];

        final query = _searchController.text.trim().toLowerCase();
        final filteredItems = allItems.where((item) {
          final matchesQuery = query.isEmpty ||
              item.name.toLowerCase().contains(query) ||
              item.code.toLowerCase().contains(query);
          final matchesCategory =
              _selectedCategory == 'All' || item.category == _selectedCategory;
          return matchesQuery && matchesCategory;
        }).toList();

        return Scaffold(
          appBar: AppBar(
            title: const Text('Items & Inventory'),
            actions: [
              IconButton(
                icon: const Icon(Icons.add),
                tooltip: 'Add Item',
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const AddEditItemScreen(),
                    ),
                  );
                },
              ),
            ],
          ),
          body: Column(
            children: [
              // Search Bar
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: SearchBar(
                  controller: _searchController,
                  leading: const Icon(Icons.search),
                  hintText: 'Search by item name or code...',
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

              // Categories Chips
              SizedBox(
                height: 48,
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  scrollDirection: Axis.horizontal,
                  itemCount: categories.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, index) {
                    final cat = categories[index];
                    final isSelected = cat == _selectedCategory;
                    return FilterChip(
                      selected: isSelected,
                      label: Text(cat),
                      onSelected: (selected) {
                        setState(() {
                          _selectedCategory = cat;
                        });
                      },
                    );
                  },
                ),
              ),
              const SizedBox(height: 8),

              // Summary counter
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Showing ${filteredItems.length} of ${allItems.length} items',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    Text(
                      'Tap item to edit',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.primary,
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),

              // Items List
              Expanded(
                child: filteredItems.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.inventory_2_outlined,
                              size: 56,
                              color: theme.colorScheme.outline,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              'No items found',
                              style: theme.textTheme.titleMedium,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Try adjusting your search or add a new item',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(12),
                        itemCount: filteredItems.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 4),
                        itemBuilder: (context, index) {
                          final item = filteredItems[index];
                          final isLowStock = item.stock <= 15;

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
                                    builder: (_) => AddEditItemScreen(item: item),
                                  ),
                                );
                              },
                              leading: CircleAvatar(
                                backgroundColor: isLowStock
                                    ? Colors.orange.shade100
                                    : theme.colorScheme.primaryContainer,
                                child: Text(
                                  item.name.isNotEmpty ? item.name[0].toUpperCase() : '?',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: isLowStock
                                        ? Colors.orange.shade900
                                        : theme.colorScheme.onPrimaryContainer,
                                  ),
                                ),
                              ),
                              title: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      item.name,
                                      style: const TextStyle(fontWeight: FontWeight.bold),
                                    ),
                                  ),
                                  Text(
                                    CurrencyFormatter.format(item.price),
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: theme.colorScheme.primary,
                                      fontSize: 16,
                                    ),
                                  ),
                                ],
                              ),
                              subtitle: Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 6,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: theme.colorScheme.surface,
                                        borderRadius: BorderRadius.circular(4),
                                        border: Border.all(
                                          color: theme.colorScheme.outlineVariant,
                                        ),
                                      ),
                                      child: Text(
                                        item.code,
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w500,
                                          color: theme.colorScheme.onSurfaceVariant,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      item.category,
                                      style: theme.textTheme.bodySmall,
                                    ),
                                    const Spacer(),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 6,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: isLowStock
                                            ? Colors.red.shade50
                                            : Colors.green.shade50,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        'Stock: ${item.stock}',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                          color: isLowStock
                                              ? Colors.red.shade800
                                              : Colors.green.shade800,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              trailing: const Icon(Icons.chevron_right, size: 20),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const AddEditItemScreen(),
                ),
              );
            },
            icon: const Icon(Icons.add),
            label: const Text('Add Item'),
          ),
        );
      },
    );
  }
}
