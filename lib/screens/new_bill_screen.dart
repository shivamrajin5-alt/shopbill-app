import 'package:flutter/material.dart';
import '../data/shop_repository.dart';
import '../models/bill.dart';
import '../models/bill_item.dart';
import '../models/item.dart';
import '../utils/currency_formatter.dart';
import '../widgets/bill_item_tile.dart';
import 'bill_success_screen.dart';

enum DiscountType { percentage, flat }

class NewBillScreen extends StatefulWidget {
  const NewBillScreen({super.key});

  @override
  State<NewBillScreen> createState() => _NewBillScreenState();
}

class _NewBillScreenState extends State<NewBillScreen> {
  final List<BillItem> _billItems = [];
  final _customerNameController = TextEditingController();
  final _customerPhoneController = TextEditingController();
  final _discountValueController = TextEditingController(text: '0');
  final _itemSearchController = TextEditingController();

  DiscountType _discountType = DiscountType.percentage;
  PaymentMethod _selectedPayment = PaymentMethod.cash;
  bool _applyGst = ShopRepository.instance.profile.enableGstByDefault;
  late double _gstRate = ShopRepository.instance.profile.taxRatePercent;

  @override
  void dispose() {
    _customerNameController.dispose();
    _customerPhoneController.dispose();
    _discountValueController.dispose();
    _itemSearchController.dispose();
    super.dispose();
  }

  // Bill Calculations
  double get _subtotal => _billItems.fold(0.0, (sum, item) => sum + item.totalPrice);

  double get _discountAmount {
    final value = double.tryParse(_discountValueController.text.trim()) ?? 0.0;
    if (value <= 0) return 0.0;
    if (_discountType == DiscountType.percentage) {
      final pct = value.clamp(0.0, 100.0);
      return (_subtotal * pct) / 100.0;
    } else {
      return value.clamp(0.0, _subtotal);
    }
  }

  double get _taxableAmount => (_subtotal - _discountAmount).clamp(0.0, double.infinity);

  double get _taxAmount {
    if (!_applyGst) return 0.0;
    return (_taxableAmount * _gstRate) / 100.0;
  }

  double get _grandTotal => _taxableAmount + _taxAmount;

  void _showGstRateDialog() {
    final controller = TextEditingController(
      text: _gstRate.toStringAsFixed(_gstRate.truncateToDouble() == _gstRate ? 0 : 1),
    );
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Set GST Rate (%)'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 8,
              children: [5.0, 12.0, 18.0, 28.0].map((rate) {
                return ActionChip(
                  label: Text('${rate.toInt()}%'),
                  onPressed: () {
                    controller.text = rate.toInt().toString();
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'GST Percentage',
                suffixText: '%',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final val = double.tryParse(controller.text.trim());
              if (val != null && val >= 0) {
                setState(() {
                  _gstRate = val;
                  _applyGst = true;
                });
              }
              Navigator.of(ctx).pop();
            },
            child: const Text('Apply Rate'),
          ),
        ],
      ),
    );
  }

  // Prompt user to enter quantity or weight when adding / editing an item
  void _promptQuantityOrWeight(Item item, {BillItem? existingBillItem}) {
    final isWeight = item.unit == ItemUnit.kg;
    final isEditing = existingBillItem != null;

    // Weight input modes: 'kg' or 'g'
    String weightInputMode = 'kg';

    double initialQuantity = existingBillItem?.quantity ?? (isWeight ? 1.0 : 1.0);
    double unitPrice = existingBillItem?.unitPrice ?? item.price;

    if (isWeight && initialQuantity < 1.0) {
      weightInputMode = 'g';
    }

    final qtyController = TextEditingController(
      text: isWeight
          ? (weightInputMode == 'g'
              ? (initialQuantity * 1000).round().toString()
              : initialQuantity.toStringAsFixed(initialQuantity.truncateToDouble() == initialQuantity ? 0 : 3))
          : initialQuantity.toInt().toString(),
    );

    final priceController = TextEditingController(text: unitPrice.toStringAsFixed(2));

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (modalCtx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            double currentEnteredQty() {
              final parsed = double.tryParse(qtyController.text.trim()) ?? 0.0;
              if (isWeight && weightInputMode == 'g') {
                return parsed / 1000.0; // convert grams to kg
              }
              return parsed;
            }

            final enteredQty = currentEnteredQty();
            final currentPrice = double.tryParse(priceController.text.trim()) ?? unitPrice;
            final lineTotal = enteredQty * currentPrice;

            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 16,
                bottom: MediaQuery.of(modalCtx).viewInsets.bottom + 20,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade300,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),

                  // Header with item info
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: isWeight ? Colors.amber.shade100 : Theme.of(context).colorScheme.primaryContainer,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(
                          isWeight ? Icons.scale : Icons.inventory_2_outlined,
                          color: isWeight ? Colors.amber.shade900 : Theme.of(context).colorScheme.primary,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.name,
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                            ),
                            Text(
                              'Code: ${item.code} • Rate: ${CurrencyFormatter.format(item.price)} ${isWeight ? "/ kg" : "/ pc"}',
                              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // If Weighted item, show kg / g toggle and presets
                  if (isWeight) ...[
                    Row(
                      children: [
                        Text(
                          'Select Weight In:',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(width: 12),
                        SegmentedButton<String>(
                          segments: const [
                            ButtonSegment(value: 'kg', label: Text('Kilograms (kg)')),
                            ButtonSegment(value: 'g', label: Text('Grams (g)')),
                          ],
                          selected: {weightInputMode},
                          onSelectionChanged: (val) {
                            setModalState(() {
                              final oldMode = weightInputMode;
                              final newMode = val.first;
                              weightInputMode = newMode;
                              final curVal = double.tryParse(qtyController.text.trim()) ?? 0.0;
                              if (oldMode == 'kg' && newMode == 'g') {
                                qtyController.text = (curVal * 1000).round().toString();
                              } else if (oldMode == 'g' && newMode == 'kg') {
                                qtyController.text = (curVal / 1000.0).toStringAsFixed(2);
                              }
                            });
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Quick Weight Buttons
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: (weightInputMode == 'g'
                              ? [
                                  {'label': '100 g', 'val': '100'},
                                  {'label': '250 g', 'val': '250'},
                                  {'label': '500 g', 'val': '500'},
                                  {'label': '750 g', 'val': '750'},
                                ]
                              : [
                                  {'label': '0.5 kg (500g)', 'val': '0.5'},
                                  {'label': '1 kg', 'val': '1'},
                                  {'label': '1.5 kg', 'val': '1.5'},
                                  {'label': '2 kg', 'val': '2'},
                                  {'label': '5 kg', 'val': '5'},
                                ])
                          .map((preset) {
                        final isSel = qtyController.text == preset['val'];
                        return ActionChip(
                          label: Text(preset['label']!),
                          backgroundColor: isSel ? Theme.of(context).colorScheme.primaryContainer : null,
                          onPressed: () {
                            setModalState(() {
                              qtyController.text = preset['val']!;
                            });
                          },
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 12),
                  ] else ...[
                    // Pieces quick presets
                    Wrap(
                      spacing: 8,
                      children: ['1', '2', '3', '5', '10'].map((preset) {
                        final isSel = qtyController.text == preset;
                        return ActionChip(
                          label: Text('$preset pcs'),
                          backgroundColor: isSel ? Theme.of(context).colorScheme.primaryContainer : null,
                          onPressed: () {
                            setModalState(() {
                              qtyController.text = preset;
                            });
                          },
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 12),
                  ],

                  // Quantity/Weight input and Unit price
                  Row(
                    children: [
                      Expanded(
                        flex: 5,
                        child: TextField(
                          controller: qtyController,
                          autofocus: true,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: InputDecoration(
                            labelText: isWeight
                                ? (weightInputMode == 'g' ? 'Enter Weight (grams)' : 'Enter Weight (kg)')
                                : 'Enter Quantity (pcs)',
                            suffixText: isWeight ? weightInputMode : 'pcs',
                            filled: true,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          onChanged: (_) => setModalState(() {}),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        flex: 4,
                        child: TextField(
                          controller: priceController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: InputDecoration(
                            labelText: 'Rate (${ShopRepository.instance.profile.currencySymbol})',
                            filled: true,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          onChanged: (_) => setModalState(() {}),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Calculated Price Banner
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surfaceVariant.withOpacity(0.5),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          isWeight
                              ? (enteredQty < 1.0
                                  ? '${(enteredQty * 1000).round()} g @ ${CurrencyFormatter.format(currentPrice)}/kg'
                                  : '$enteredQty kg @ ${CurrencyFormatter.format(currentPrice)}/kg')
                              : '$enteredQty pcs @ ${CurrencyFormatter.format(currentPrice)}/pc',
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                        ),
                        Text(
                          CurrencyFormatter.format(lineTotal),
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 18,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  FilledButton.icon(
                    onPressed: enteredQty <= 0
                        ? null
                        : () {
                            setState(() {
                              final existingIdx = _billItems.indexWhere((bi) => bi.itemId == item.id);
                              if (existingIdx != -1) {
                                _billItems[existingIdx].quantity = enteredQty;
                                _billItems[existingIdx].unitPrice = currentPrice;
                              } else {
                                _billItems.add(BillItem(
                                  itemId: item.id,
                                  name: item.name,
                                  code: item.code,
                                  unitPrice: currentPrice,
                                  quantity: enteredQty,
                                  unit: item.unit,
                                ));
                              }
                            });
                            Navigator.of(modalCtx).pop();
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Added ${item.name} to bill'),
                                duration: const Duration(milliseconds: 700),
                              ),
                            );
                          },
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.check),
                    label: Text(
                      isEditing ? 'Update in Bill' : 'Add to Bill',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _incrementQty(int index) {
    setState(() {
      final item = _billItems[index];
      if (item.unit == ItemUnit.kg) {
        item.quantity += 0.25; // 250 grams increment
      } else {
        item.quantity += 1.0;
      }
    });
  }

  void _decrementQty(int index) {
    setState(() {
      final item = _billItems[index];
      final step = item.unit == ItemUnit.kg ? 0.25 : 1.0;
      if (item.quantity > step) {
        item.quantity -= step;
      } else {
        _billItems.removeAt(index);
      }
    });
  }

  void _showItemSearchModal() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final repo = ShopRepository.instance;
            final query = _itemSearchController.text.trim().toLowerCase();
            final matches = repo.items.where((i) {
              return query.isEmpty ||
                  i.name.toLowerCase().contains(query) ||
                  i.code.toLowerCase().contains(query);
            }).toList();

            return DraggableScrollableSheet(
              initialChildSize: 0.8,
              minChildSize: 0.5,
              maxChildSize: 0.95,
              expand: false,
              builder: (_, scrollController) {
                return Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  child: Column(
                    children: [
                      Container(
                        width: 40,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Select Item to Add',
                            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => Navigator.of(ctx).pop(),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      SearchBar(
                        controller: _itemSearchController,
                        hintText: 'Search by name or code...',
                        leading: const Icon(Icons.search),
                        elevation: const WidgetStatePropertyAll(0),
                        backgroundColor: WidgetStatePropertyAll(
                          Theme.of(context).colorScheme.surfaceVariant.withOpacity(0.5),
                        ),
                        trailing: [
                          if (_itemSearchController.text.isNotEmpty)
                            IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: () {
                                setModalState(() {
                                  _itemSearchController.clear();
                                });
                              },
                            ),
                        ],
                        onChanged: (_) => setModalState(() {}),
                      ),
                      const SizedBox(height: 12),
                      Expanded(
                        child: matches.isEmpty
                            ? const Center(child: Text('No matching items found.'))
                            : ListView.separated(
                                controller: scrollController,
                                itemCount: matches.length,
                                separatorBuilder: (_, __) => const Divider(height: 1),
                                itemBuilder: (context, idx) {
                                  final itm = matches[idx];
                                  final existingBillItem = _billItems.cast<BillItem?>().firstWhere(
                                        (bi) => bi?.itemId == itm.id,
                                        orElse: () => null,
                                      );

                                  return ListTile(
                                    title: Row(
                                      children: [
                                        Text(
                                          itm.name,
                                          style: const TextStyle(fontWeight: FontWeight.w600),
                                        ),
                                        if (itm.unit == ItemUnit.kg) ...[
                                          const SizedBox(width: 8),
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                            decoration: BoxDecoration(
                                              color: Colors.amber.shade100,
                                              borderRadius: BorderRadius.circular(4),
                                            ),
                                            child: Text(
                                              'kg / g',
                                              style: TextStyle(
                                                fontSize: 10,
                                                fontWeight: FontWeight.bold,
                                                color: Colors.amber.shade900,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                    subtitle: Text(
                                      'Code: ${itm.code} • Stock: ${itm.stock} ${itm.unit.displayName}',
                                    ),
                                    trailing: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          itm.priceLabel,
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            color: Theme.of(context).colorScheme.primary,
                                            fontSize: 14,
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        FilledButton.tonal(
                                          style: FilledButton.styleFrom(
                                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                            visualDensity: VisualDensity.compact,
                                          ),
                                          onPressed: () {
                                            Navigator.of(ctx).pop();
                                            _promptQuantityOrWeight(
                                              itm,
                                              existingBillItem: existingBillItem,
                                            );
                                          },
                                          child: Text(
                                            existingBillItem != null
                                                ? existingBillItem.formattedQuantity
                                                : '+ Qty/Wt',
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12.0),
                        child: FilledButton(
                          onPressed: () => Navigator.of(ctx).pop(),
                          child: const Text('Close Catalog'),
                        ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );
  }

  void _saveBill() {
    if (_billItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please add at least one item to save the bill.')),
      );
      return;
    }

    final repo = ShopRepository.instance;
    final bill = repo.createBill(
      items: List.from(_billItems),
      subtotal: _subtotal,
      discountAmount: _discountAmount,
      taxAmount: _taxAmount,
      grandTotal: _grandTotal,
      paymentMethod: _selectedPayment,
      customerName: _customerNameController.text,
      customerPhone: _customerPhoneController.text,
    );

    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => BillSuccessScreen(bill: bill),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final profile = ShopRepository.instance.profile;

    return Scaffold(
      appBar: AppBar(
        title: const Text('New Bill'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_box_outlined),
            tooltip: 'Add Items',
            onPressed: _showItemSearchModal,
          ),
        ],
      ),
      body: Column(
        children: [
          // Quick Item Add Bar
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            color: theme.colorScheme.surfaceVariant.withOpacity(0.3),
            child: Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: _showItemSearchModal,
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: theme.colorScheme.outlineVariant),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.search, color: theme.colorScheme.onSurfaceVariant),
                          const SizedBox(width: 10),
                          Text(
                            'Search & add item with quantity / weight...',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton.tonalIcon(
                  onPressed: _showItemSearchModal,
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Browse'),
                ),
              ],
            ),
          ),

          // Bill Items List
          Expanded(
            child: _billItems.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.shopping_cart_outlined,
                            size: 64,
                            color: theme.colorScheme.outline,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Bill is currently empty',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Tap "Search & add item" above to enter quantity or weight.',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(height: 20),
                          FilledButton.icon(
                            onPressed: _showItemSearchModal,
                            icon: const Icon(Icons.search),
                            label: const Text('Open Item Catalog'),
                          ),
                        ],
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.only(top: 8, bottom: 8),
                    itemCount: _billItems.length,
                    itemBuilder: (context, index) {
                      final item = _billItems[index];
                      final origItem = ShopRepository.instance.findItemById(item.itemId) ??
                          Item(
                            id: item.itemId,
                            name: item.name,
                            code: item.code,
                            price: item.unitPrice,
                            stock: 999,
                            category: 'General',
                            unit: item.unit,
                          );

                      return BillItemTile(
                        item: item,
                        onIncrement: () => _incrementQty(index),
                        onDecrement: () => _decrementQty(index),
                        onEditQuantity: () => _promptQuantityOrWeight(origItem, existingBillItem: item),
                        onEditPrice: () => _promptQuantityOrWeight(origItem, existingBillItem: item),
                        onDelete: () {
                          setState(() {
                            _billItems.removeAt(index);
                          });
                        },
                      );
                    },
                  ),
          ),

          // Bottom Billing Tray
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.08),
                  blurRadius: 12,
                  offset: const Offset(0, -4),
                ),
              ],
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Discount & Customer Controls
                Row(
                  children: [
                    Expanded(
                      flex: 5,
                      child: Row(
                        children: [
                          SegmentedButton<DiscountType>(
                            segments: const [
                              ButtonSegment(value: DiscountType.percentage, label: Text('%')),
                              ButtonSegment(value: DiscountType.flat, label: Text('Flat')),
                            ],
                            selected: {_discountType},
                            onSelectionChanged: (val) {
                              setState(() {
                                _discountType = val.first;
                              });
                            },
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextField(
                              controller: _discountValueController,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              decoration: InputDecoration(
                                labelText: 'Discount',
                                isDense: true,
                                suffixText: _discountType == DiscountType.percentage ? '%' : profile.currencySymbol,
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                              ),
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 4,
                      child: TextField(
                        controller: _customerNameController,
                        decoration: InputDecoration(
                          labelText: 'Customer (Optional)',
                          hintText: 'Name',
                          isDense: true,
                          prefixIcon: const Icon(Icons.person_outline, size: 16),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Payment Method Selector
                Row(
                  children: [
                    Text(
                      'Payment:',
                      style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: PaymentMethod.values.map((m) {
                            final isSel = _selectedPayment == m;
                            return Padding(
                              padding: const EdgeInsets.only(right: 6),
                              child: ChoiceChip(
                                selected: isSel,
                                label: Text(m.displayName),
                                onSelected: (_) {
                                  setState(() => _selectedPayment = m);
                                },
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                // GST Toggle Control
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: _applyGst
                        ? theme.colorScheme.primaryContainer.withOpacity(0.35)
                        : theme.colorScheme.surfaceVariant.withOpacity(0.25),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: _applyGst
                          ? theme.colorScheme.primary.withOpacity(0.4)
                          : theme.colorScheme.outlineVariant.withOpacity(0.4),
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.percent,
                        size: 16,
                        color: _applyGst ? theme.colorScheme.primary : Colors.grey.shade600,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Add GST (Tax)',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                                color: _applyGst ? theme.colorScheme.primary : null,
                              ),
                            ),
                            Text(
                              _applyGst
                                  ? 'Applying ${_gstRate.toStringAsFixed(_gstRate.truncateToDouble() == _gstRate ? 0 : 1)}% GST (${CurrencyFormatter.format(_taxAmount)})'
                                  : 'No GST added to this bill (0%)',
                              style: theme.textTheme.bodySmall?.copyWith(fontSize: 10, color: Colors.grey.shade600),
                            ),
                          ],
                        ),
                      ),
                      if (_applyGst)
                        ActionChip(
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.zero,
                          label: Text(
                            '${_gstRate.toStringAsFixed(_gstRate.truncateToDouble() == _gstRate ? 0 : 1)}% Edit',
                            style: const TextStyle(fontSize: 10),
                          ),
                          onPressed: _showGstRateDialog,
                        ),
                      const SizedBox(width: 6),
                      Switch(
                        value: _applyGst,
                        visualDensity: VisualDensity.compact,
                        onChanged: (val) {
                          setState(() {
                            _applyGst = val;
                          });
                        },
                      ),
                    ],
                  ),
                ),
                const Divider(height: 14),

                // Summary
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Subtotal (${_billItems.length} items)', style: theme.textTheme.bodySmall),
                    Text(CurrencyFormatter.format(_subtotal), style: theme.textTheme.bodySmall),
                  ],
                ),
                if (_discountAmount > 0)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Discount', style: theme.textTheme.bodySmall?.copyWith(color: Colors.red)),
                      Text('- ${CurrencyFormatter.format(_discountAmount)}',
                          style: theme.textTheme.bodySmall?.copyWith(color: Colors.red)),
                    ],
                  ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _applyGst
                          ? 'GST (${_gstRate.toStringAsFixed(_gstRate.truncateToDouble() == _gstRate ? 0 : 1)}%)'
                          : 'GST',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: _applyGst ? null : Colors.grey.shade600,
                      ),
                    ),
                    Text(
                      _applyGst ? CurrencyFormatter.format(_taxAmount) : 'None (0%)',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: _applyGst ? FontWeight.bold : FontWeight.normal,
                        color: _applyGst ? null : Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),

                // Grand Total & Save Button
                Row(
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Grand Total', style: theme.textTheme.labelMedium),
                        Text(
                          CurrencyFormatter.format(_grandTotal),
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: theme.colorScheme.primary,
                          ),
                        ),
                      ],
                    ),
                    const Spacer(),
                    FilledButton.icon(
                      onPressed: _billItems.isEmpty ? null : _saveBill,
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      icon: const Icon(Icons.check_circle),
                      label: const Text(
                        'Save & Generate Bill',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
