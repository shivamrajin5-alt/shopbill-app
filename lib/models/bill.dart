import 'bill_item.dart';

enum PaymentMethod { cash, upi, card, other }

extension PaymentMethodExtension on PaymentMethod {
  String get displayName {
    switch (this) {
      case PaymentMethod.cash:
        return 'Cash';
      case PaymentMethod.upi:
        return 'UPI';
      case PaymentMethod.card:
        return 'Card';
      case PaymentMethod.other:
        return 'Other';
    }
  }

  static PaymentMethod fromString(String val) {
    switch (val.toLowerCase()) {
      case 'upi':
        return PaymentMethod.upi;
      case 'card':
        return PaymentMethod.card;
      case 'other':
        return PaymentMethod.other;
      default:
        return PaymentMethod.cash;
    }
  }
}

class Bill {
  final String id;
  final String billNumber;
  final DateTime createdAt;
  final List<BillItem> items;
  final String? customerName;
  final String? customerPhone;
  final double subtotal;
  final double discountAmount;
  final double taxAmount;
  final double grandTotal;
  final PaymentMethod paymentMethod;
  final String cashierName;

  Bill({
    required this.id,
    required this.billNumber,
    required this.createdAt,
    required this.items,
    this.customerName,
    this.customerPhone,
    required this.subtotal,
    required this.discountAmount,
    required this.taxAmount,
    required this.grandTotal,
    required this.paymentMethod,
    required this.cashierName,
  });

  int get totalItemsCount => items.length;
  double get totalQuantitySum => items.fold(0.0, (sum, i) => sum + i.quantity);
  bool get hasTax => taxAmount > 0;
}
