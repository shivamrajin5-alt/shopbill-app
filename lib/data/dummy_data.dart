import '../models/item.dart';
import '../models/bill.dart';
import '../models/bill_item.dart';
import '../models/user.dart';

class DummyData {
  static final List<AppUser> initialUsers = [
    const AppUser(
      id: 'u1',
      name: 'Rajesh Sharma',
      email: 'owner@shopbill.local',
      pin: '1234',
      role: UserRole.owner,
    ),
    const AppUser(
      id: 'u2',
      name: 'Sunil Kumar',
      email: 'cashier@shopbill.local',
      pin: '0000',
      role: UserRole.employee,
    ),
  ];

  static final List<Item> initialItems = [
    Item(id: 'i1', name: 'Basmati Rice', code: 'BR101', price: 120.0, stock: 45.0, category: 'Groceries', unit: ItemUnit.kg),
    Item(id: 'i2', name: 'Refined Sugar', code: 'RS105', price: 46.0, stock: 80.0, category: 'Groceries', unit: ItemUnit.kg),
    Item(id: 'i3', name: 'Detergent Powder', code: 'DP109', price: 140.0, stock: 50.0, category: 'Cleaning', unit: ItemUnit.kg),
    Item(id: 'i4', name: 'Whole Wheat Flour', code: 'WF104', price: 46.0, stock: 100.0, category: 'Groceries', unit: ItemUnit.kg),
    Item(id: 'i5', name: 'Sunflower Oil 1L', code: 'SO102', price: 165.0, stock: 30.0, category: 'Groceries', unit: ItemUnit.pcs),
    Item(id: 'i6', name: 'Tata Tea Gold 500g', code: 'TG103', price: 290.0, stock: 25.0, category: 'Beverages', unit: ItemUnit.pcs),
    Item(id: 'i7', name: 'Milk Bread 400g', code: 'MB106', price: 45.0, stock: 15.0, category: 'Bakery', unit: ItemUnit.pcs),
    Item(id: 'i8', name: 'Amul Butter 100g', code: 'AB107', price: 58.0, stock: 35.0, category: 'Dairy', unit: ItemUnit.pcs),
    Item(id: 'i9', name: 'Instant Coffee 100g', code: 'IC108', price: 195.0, stock: 20.0, category: 'Beverages', unit: ItemUnit.pcs),
    Item(id: 'i10', name: 'Dishwash Bar 250g', code: 'DB110', price: 30.0, stock: 65.0, category: 'Cleaning', unit: ItemUnit.pcs),
    Item(id: 'i11', name: 'Toothpaste 150g', code: 'TP111', price: 95.0, stock: 40.0, category: 'Personal Care', unit: ItemUnit.pcs),
    Item(id: 'i12', name: 'Bath Soap 125g Pack of 4', code: 'BS112', price: 175.0, stock: 28.0, category: 'Personal Care', unit: ItemUnit.pcs),
  ];

  static List<Bill> getInitialBills() {
    final now = DateTime.now();
    return [
      Bill(
        id: 'b1',
        billNumber: 'SB-1001',
        createdAt: now.subtract(const Duration(hours: 3)),
        items: [
          BillItem(itemId: 'i1', name: 'Basmati Rice', code: 'BR101', unitPrice: 120.0, quantity: 1.5, unit: ItemUnit.kg), // 180
          BillItem(itemId: 'i5', name: 'Sunflower Oil 1L', code: 'SO102', unitPrice: 165.0, quantity: 1.0, unit: ItemUnit.pcs), // 165
        ],
        customerName: 'Anil Verma',
        customerPhone: '9811223344',
        subtotal: 345.0,
        discountAmount: 20.0,
        taxAmount: 0.0, // No GST added
        grandTotal: 325.0,
        paymentMethod: PaymentMethod.upi,
        cashierName: 'Rajesh Sharma',
      ),
      Bill(
        id: 'b2',
        billNumber: 'SB-1002',
        createdAt: now.subtract(const Duration(hours: 1, minutes: 20)),
        items: [
          BillItem(itemId: 'i6', name: 'Tata Tea Gold 500g', code: 'TG103', unitPrice: 290.0, quantity: 1.0, unit: ItemUnit.pcs),
          BillItem(itemId: 'i2', name: 'Refined Sugar', code: 'RS105', unitPrice: 46.0, quantity: 0.5, unit: ItemUnit.kg), // 500g = 23
          BillItem(itemId: 'i8', name: 'Amul Butter 100g', code: 'AB107', unitPrice: 58.0, quantity: 1.0, unit: ItemUnit.pcs),
        ],
        customerName: 'Priya Mehta',
        customerPhone: '9877001122',
        subtotal: 371.0,
        discountAmount: 0.0,
        taxAmount: 0.0, // No GST added
        grandTotal: 371.0,
        paymentMethod: PaymentMethod.cash,
        cashierName: 'Sunil Kumar',
      ),
      Bill(
        id: 'b3',
        billNumber: 'SB-1003',
        createdAt: now.subtract(const Duration(days: 2, hours: 4)),
        items: [
          BillItem(itemId: 'i4', name: 'Whole Wheat Flour', code: 'WF104', unitPrice: 46.0, quantity: 5.0, unit: ItemUnit.kg), // 230
          BillItem(itemId: 'i3', name: 'Detergent Powder', code: 'DP109', unitPrice: 140.0, quantity: 2.0, unit: ItemUnit.kg), // 280
        ],
        customerName: 'Kavita Singh',
        customerPhone: '9988776655',
        subtotal: 510.0,
        discountAmount: 30.0,
        taxAmount: 24.0,
        grandTotal: 504.0,
        paymentMethod: PaymentMethod.card,
        cashierName: 'Rajesh Sharma',
      ),
    ];
  }
}
