import 'item.dart';

class BillItem {
  final String itemId;
  final String name;
  final String code;
  double unitPrice;
  double quantity; // Supports fractions like 0.5 kg (500g)
  ItemUnit unit;

  BillItem({
    required this.itemId,
    required this.name,
    required this.code,
    required this.unitPrice,
    required this.quantity,
    this.unit = ItemUnit.pcs,
  });

  factory BillItem.fromItem(
    Item item, {
    double quantity = 1.0,
    double? customPrice,
  }) {
    return BillItem(
      itemId: item.id,
      name: item.name,
      code: item.code,
      unitPrice: customPrice ?? item.price,
      quantity: quantity,
      unit: item.unit,
    );
  }

  double get totalPrice => unitPrice * quantity;

  String get formattedQuantity {
    if (unit == ItemUnit.kg) {
      if (quantity < 1.0 && quantity > 0) {
        final grams = (quantity * 1000).round();
        return '$grams g';
      }
      final cleanNum = quantity.toStringAsFixed(quantity.truncateToDouble() == quantity ? 0 : 3);
      return '$cleanNum kg';
    } else {
      if (quantity.truncateToDouble() == quantity) {
        return '${quantity.toInt()} pcs';
      }
      return '${quantity.toStringAsFixed(2)} pcs';
    }
  }

  BillItem copyWith({
    String? itemId,
    String? name,
    String? code,
    double? unitPrice,
    double? quantity,
    ItemUnit? unit,
  }) {
    return BillItem(
      itemId: itemId ?? this.itemId,
      name: name ?? this.name,
      code: code ?? this.code,
      unitPrice: unitPrice ?? this.unitPrice,
      quantity: quantity ?? this.quantity,
      unit: unit ?? this.unit,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'itemId': itemId,
      'name': name,
      'code': code,
      'unitPrice': unitPrice,
      'quantity': quantity,
      'unit': unit.displayName,
      'totalPrice': totalPrice,
    };
  }

  factory BillItem.fromMap(Map<String, dynamic> map) {
    return BillItem(
      itemId: map['itemId'] as String,
      name: map['name'] as String,
      code: map['code'] as String,
      unitPrice: (map['unitPrice'] as num).toDouble(),
      quantity: (map['quantity'] as num).toDouble(),
      unit: ItemUnitExtension.fromString(map['unit'] as String?),
    );
  }
}
