import 'package:flutter/material.dart';
import '../data/shop_repository.dart';
import '../models/item.dart';
import '../widgets/custom_text_field.dart';

class AddEditItemScreen extends StatefulWidget {
  final Item? item;

  const AddEditItemScreen({super.key, this.item});

  @override
  State<AddEditItemScreen> createState() => _AddEditItemScreenState();
}

class _AddEditItemScreenState extends State<AddEditItemScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _nameController;
  late TextEditingController _codeController;
  late TextEditingController _priceController;
  late TextEditingController _stockController;
  late String _selectedCategory;
  late ItemUnit _selectedUnit;

  final List<String> _presetCategories = [
    'Groceries',
    'Beverages',
    'Dairy',
    'Bakery',
    'Snacks',
    'Cleaning',
    'Personal Care',
    'Stationery',
    'General',
  ];

  bool get isEditing => widget.item != null;

  @override
  void initState() {
    super.initState();
    final item = widget.item;
    _nameController = TextEditingController(text: item?.name ?? '');
    _codeController = TextEditingController(
      text: item?.code ?? 'ITM-${DateTime.now().millisecondsSinceEpoch % 10000}',
    );
    _priceController = TextEditingController(
      text: item != null ? item.price.toStringAsFixed(2) : '',
    );
    _stockController = TextEditingController(
      text: item != null ? item.stock.toStringAsFixed(item.stock.truncateToDouble() == item.stock ? 0 : 2) : '50',
    );
    _selectedCategory = item?.category ?? 'Groceries';
    _selectedUnit = item?.unit ?? ItemUnit.pcs;
    if (!_presetCategories.contains(_selectedCategory)) {
      _presetCategories.add(_selectedCategory);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _codeController.dispose();
    _priceController.dispose();
    _stockController.dispose();
    super.dispose();
  }

  void _saveItem() {
    if (!_formKey.currentState!.validate()) return;

    final repo = ShopRepository.instance;
    final price = double.tryParse(_priceController.text.trim()) ?? 0.0;
    final stock = double.tryParse(_stockController.text.trim()) ?? 0.0;

    if (isEditing) {
      final updated = widget.item!.copyWith(
        name: _nameController.text.trim(),
        code: _codeController.text.trim(),
        price: price,
        stock: stock,
        category: _selectedCategory,
        unit: _selectedUnit,
      );
      repo.updateItem(updated);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Item updated successfully')),
      );
    } else {
      final newItem = Item(
        id: 'itm_${DateTime.now().millisecondsSinceEpoch}',
        name: _nameController.text.trim(),
        code: _codeController.text.trim(),
        price: price,
        stock: stock,
        category: _selectedCategory,
        unit: _selectedUnit,
      );
      repo.addItem(newItem);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('New item added to inventory')),
      );
    }

    Navigator.of(context).pop();
  }

  void _confirmDelete() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Item'),
        content: Text('Are you sure you want to delete "${widget.item!.name}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () {
              ShopRepository.instance.deleteItem(widget.item!.id);
              Navigator.of(ctx).pop();
              Navigator.of(context).pop();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Item deleted')),
              );
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final currency = ShopRepository.instance.profile.currencySymbol;
    final isWeight = _selectedUnit == ItemUnit.kg;

    return Scaffold(
      appBar: AppBar(
        title: Text(isEditing ? 'Edit Item' : 'Add New Item'),
        actions: [
          if (isEditing)
            IconButton(
              icon: const Icon(Icons.delete_outline, color: Colors.red),
              tooltip: 'Delete Item',
              onPressed: _confirmDelete,
            ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              CustomTextField(
                controller: _nameController,
                label: 'Item Name *',
                hint: isWeight ? 'e.g. Basmati Rice or Sugar' : 'e.g. Milk Bread 400g',
                prefixIcon: Icons.shopping_bag_outlined,
                validator: (val) {
                  if (val == null || val.trim().isEmpty) {
                    return 'Please enter item name';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),

              CustomTextField(
                controller: _codeController,
                label: 'Item Code / SKU *',
                hint: 'e.g. BR101',
                prefixIcon: Icons.qr_code_2,
                validator: (val) {
                  if (val == null || val.trim().isEmpty) {
                    return 'Please enter item code or SKU';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),

              // Unit of Measurement selector
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Unit of Measurement',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                  const SizedBox(height: 8),
                  SegmentedButton<ItemUnit>(
                    segments: const [
                      ButtonSegment(
                        value: ItemUnit.pcs,
                        icon: Icon(Icons.numbers),
                        label: Text('Pieces (pcs)'),
                      ),
                      ButtonSegment(
                        value: ItemUnit.kg,
                        icon: Icon(Icons.scale),
                        label: Text('Weight (kg / g)'),
                      ),
                    ],
                    selected: {_selectedUnit},
                    onSelectionChanged: (val) {
                      setState(() {
                        _selectedUnit = val.first;
                      });
                    },
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Category Dropdown
              DropdownButtonFormField<String>(
                value: _selectedCategory,
                decoration: InputDecoration(
                  labelText: 'Category *',
                  prefixIcon: const Icon(Icons.category_outlined),
                  filled: true,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
                items: _presetCategories.map((cat) {
                  return DropdownMenuItem(value: cat, child: Text(cat));
                }).toList(),
                onChanged: (val) {
                  if (val != null) setState(() => _selectedCategory = val);
                },
              ),
              const SizedBox(height: 16),

              Row(
                children: [
                  Expanded(
                    child: CustomTextField(
                      controller: _priceController,
                      label: isWeight ? 'Price per kg ($currency) *' : 'Price per pc ($currency) *',
                      hint: '0.00',
                      prefixIcon: Icons.currency_rupee,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) {
                          return 'Enter price';
                        }
                        final num = double.tryParse(val.trim());
                        if (num == null || num <= 0) {
                          return 'Valid price > 0';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: CustomTextField(
                      controller: _stockController,
                      label: isWeight ? 'Stock (kg) *' : 'Stock (pcs) *',
                      hint: '0',
                      prefixIcon: isWeight ? Icons.scale : Icons.inventory,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) {
                          return 'Enter stock';
                        }
                        final num = double.tryParse(val.trim());
                        if (num == null || num < 0) {
                          return 'Valid stock >= 0';
                        }
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 32),

              FilledButton.icon(
                onPressed: _saveItem,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                icon: const Icon(Icons.check_circle_outline),
                label: Text(
                  isEditing ? 'Save Changes' : 'Create Item',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
