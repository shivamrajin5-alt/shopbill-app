enum ItemUnit { pcs, kg }

extension ItemUnitExtension on ItemUnit {
  String get displayName {
    switch (this) {
      case ItemUnit.kg:
        return 'kg';
      case ItemUnit.pcs:
        return 'pcs';
    }
  }

  String get label {
    switch (this) {
      case ItemUnit.kg:
        return 'Weight (kg / g)';
      case ItemUnit.pcs:
        return 'Pieces (pcs)';
    }
  }

  bool get isWeighted => this == ItemUnit.kg;

  static ItemUnit fromString(String? val) {
    if (val?.toLowerCase() == 'kg') return ItemUnit.kg;
    return ItemUnit.pcs;
  }
}

class Item {
  final String id;
  String name;
  String code;
  double price; // Price per unit (e.g. per kg or per piece)
  double stock; // Stock in kg or pieces
  String category;
  ItemUnit unit;

  Item({
    required this.id,
    required this.name,
    required this.code,
    required this.price,
    required this.stock,
    required this.category,
    this.unit = ItemUnit.pcs,
  });

  bool get isWeighted => unit == ItemUnit.kg;

  String get priceLabel => isWeighted ? '₹${price.toStringAsFixed(2)} / kg' : '₹${price.toStringAsFixed(2)} / pc';

  Item copyWith({
    String? id,
    String? name,
    String? code,
    double? price,
    double? stock,
    String? category,
    ItemUnit? unit,
  }) {
    return Item(
      id: id ?? this.id,
      name: name ?? this.name,
      code: code ?? this.code,
      price: price ?? this.price,
      stock: stock ?? this.stock,
      category: category ?? this.category,
      unit: unit ?? this.unit,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'code': code,
      'price': price,
      'stock': stock,
      'category': category,
      'unit': unit.displayName,
    };
  }

  factory Item.fromMap(Map<String, dynamic> map) {
    return Item(
      id: map['id'] as String,
      name: map['name'] as String,
      code: map['code'] as String,
      price: (map['price'] as num).toDouble(),
      stock: (map['stock'] as num).toDouble(),
      category: map['category'] as String,
      unit: ItemUnitExtension.fromString(map['unit'] as String?),
    );
  }
}
