import 'package:flutter/foundation.dart';
import '../models/bill.dart';
import '../models/bill_item.dart';
import '../models/item.dart';
import '../models/shop_owner.dart';
import '../models/user.dart';
import '../utils/constants.dart';
import 'dummy_data.dart';

class ShopProfile {
  String name;
  String tagline;
  String phone;
  String address;
  String gstin;
  double taxRatePercent;
  String currencySymbol;
  bool enableGstByDefault;

  ShopProfile({
    required this.name,
    required this.tagline,
    required this.phone,
    required this.address,
    required this.gstin,
    required this.taxRatePercent,
    required this.currencySymbol,
    this.enableGstByDefault = false,
  });
}

class ReportData {
  final double totalSales;
  final int totalBills;
  final double totalItemsSold;
  final double totalDiscount;
  final Map<PaymentMethod, double> paymentBreakdown;
  final List<MapEntry<String, double>> topSellingItems; // Name to sold quantity

  ReportData({
    required this.totalSales,
    required this.totalBills,
    required this.totalItemsSold,
    required this.totalDiscount,
    required this.paymentBreakdown,
    required this.topSellingItems,
  });
}

class ShopRepository extends ChangeNotifier {
  static final ShopRepository instance = ShopRepository._internal();
  factory ShopRepository() => instance;

  ShopRepository._internal() {
    _init();
  }

  late List<Item> _items;
  late List<Bill> _bills;
  late List<AppUser> _users;
  late List<ShopOwner> _shopOwners;
  AppUser? _currentUser;
  late ShopProfile _profile;

  List<Item> get items => List.unmodifiable(_items);
  List<Bill> get bills => List.unmodifiable(_bills);
  List<AppUser> get users => List.unmodifiable(_users);
  List<ShopOwner> get shopOwners => List.unmodifiable(_shopOwners);
  AppUser? get currentUser => _currentUser;
  ShopProfile get profile => _profile;

  void _init() {
    _items = List.from(DummyData.initialItems);
    _bills = DummyData.getInitialBills();
    _users = List.from(DummyData.initialUsers);
    _currentUser = _users.first; // default to owner
    _profile = ShopProfile(
      name: AppConstants.defaultShopName,
      tagline: AppConstants.defaultTagline,
      phone: AppConstants.defaultPhone,
      address: AppConstants.defaultAddress,
      gstin: AppConstants.defaultGstin,
      taxRatePercent: AppConstants.defaultTaxRate,
      currencySymbol: AppConstants.currencySymbol,
      enableGstByDefault: false,
    );

    _shopOwners = [
      ShopOwner(
        id: 'SB-1001',
        shopId: 'SB-1001',
        ownerName: 'Rajesh Sharma',
        email: 'rajesh@quickmart.in',
        phone: '+91 98765 43210',
        pin: '1234',
        shopName: 'QuickMart Store',
        address: 'Shop No. 12, Main Market Road, Central Plaza',
        gstin: '27ABCDE1234F1Z5',
        registeredAt: DateTime.now().subtract(const Duration(days: 45)),
        isActive: true,
        totalBillsCount: 3,
        totalRevenue: 1200.0,
      ),
      ShopOwner(
        id: 'SB-1002',
        shopId: 'SB-1002',
        ownerName: 'Amit Patel',
        email: 'amit@pateldairy.in',
        phone: '+91 98220 11223',
        pin: '5566',
        shopName: 'Patel Provision & Dairy',
        address: 'B-14 Anand Complex, Station Road',
        gstin: '24AAACP1234A1Z1',
        registeredAt: DateTime.now().subtract(const Duration(days: 20)),
        isActive: true,
        totalBillsCount: 18,
        totalRevenue: 8450.0,
      ),
      ShopOwner(
        id: 'SB-1003',
        shopId: 'SB-1003',
        ownerName: 'Neha Verma',
        email: 'neha@dailyfresh.in',
        phone: '+91 99881 22334',
        pin: '7788',
        shopName: 'DailyFresh Supermarket',
        address: '45 Green Park, Ring Road',
        gstin: '07AAPCN9876Q1Z9',
        registeredAt: DateTime.now().subtract(const Duration(days: 8)),
        isActive: true,
        totalBillsCount: 34,
        totalRevenue: 19680.0,
      ),
      ShopOwner(
        id: 'SB-1004',
        shopId: 'SB-1004',
        ownerName: 'Vikram Sharma',
        email: 'vikram@sharmaelec.in',
        phone: '+91 91234 56789',
        pin: '9999',
        shopName: 'Sharma Electronics (Suspended)',
        address: 'Plot 22, Commercial Phase II',
        gstin: '06AAACS4567B1Z2',
        registeredAt: DateTime.now().subtract(const Duration(days: 2)),
        isActive: false, // Suspended shop
        totalBillsCount: 0,
        totalRevenue: 0.0,
      ),
    ];
  }

  void resetToDefaults() {
    _init();
    notifyListeners();
  }

  // Auth: Login with Shop ID & Staff PIN
  Map<String, dynamic> loginWithShopIdAndPin(String shopId, String pin) {
    final cleanId = shopId.trim().toUpperCase();
    final cleanPin = pin.trim();

    final matches = _shopOwners.where(
      (s) => s.shopId.toUpperCase() == cleanId || s.id.toUpperCase() == cleanId,
    );

    if (matches.isEmpty) {
      return {
        'success': false,
        'error': 'Shop ID "$cleanId" not found. Please contact your administrator.',
      };
    }

    final shop = matches.first;

    if (!shop.isActive) {
      return {
        'success': false,
        'error': 'Shop "${shop.shopName}" ($cleanId) is DEACTIVATED by admin. Access is currently suspended.',
      };
    }

    if (shop.pin != cleanPin) {
      return {
        'success': false,
        'error': 'Incorrect 4-digit PIN for Shop ID $cleanId. Please try again.',
      };
    }

    // Update active profile
    _profile.name = shop.shopName;
    _profile.phone = shop.phone;
    _profile.address = shop.address;
    _profile.gstin = shop.gstin;

    _currentUser = AppUser(
      id: 'u_${shop.id}',
      name: shop.ownerName,
      email: shop.email,
      pin: shop.pin,
      role: UserRole.owner,
    );

    notifyListeners();
    return {
      'success': true,
      'shop': shop,
    };
  }

  bool login(String pin) {
    try {
      final user = _users.firstWhere((u) => u.pin == pin);
      _currentUser = user;
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  void setCurrentUser(AppUser user) {
    _currentUser = user;
    notifyListeners();
  }

  void logout() {
    _currentUser = null;
    notifyListeners();
  }

  // Items CRUD
  void addItem(Item item) {
    _items.insert(0, item);
    notifyListeners();
  }

  void updateItem(Item item) {
    final idx = _items.indexWhere((i) => i.id == item.id);
    if (idx != -1) {
      _items[idx] = item;
      notifyListeners();
    }
  }

  void deleteItem(String id) {
    _items.removeWhere((i) => i.id == id);
    notifyListeners();
  }

  Item? findItemById(String id) {
    try {
      return _items.firstWhere((i) => i.id == id);
    } catch (_) {
      return null;
    }
  }

  // Bills Management
  String generateNextBillNumber() {
    final count = _bills.length + 1001;
    return 'SB-$count';
  }

  Bill createBill({
    required List<BillItem> items,
    required double subtotal,
    required double discountAmount,
    required double taxAmount,
    required double grandTotal,
    required PaymentMethod paymentMethod,
    String? customerName,
    String? customerPhone,
  }) {
    final bill = Bill(
      id: 'b_${DateTime.now().millisecondsSinceEpoch}',
      billNumber: generateNextBillNumber(),
      createdAt: DateTime.now(),
      items: items,
      customerName: customerName?.trim().isEmpty == true ? null : customerName?.trim(),
      customerPhone: customerPhone?.trim().isEmpty == true ? null : customerPhone?.trim(),
      subtotal: subtotal,
      discountAmount: discountAmount,
      taxAmount: taxAmount,
      grandTotal: grandTotal,
      paymentMethod: paymentMethod,
      cashierName: _currentUser?.name ?? 'Shop Cashier',
    );

    // Update item stock counts
    for (final bItem in items) {
      final foundIdx = _items.indexWhere((i) => i.id == bItem.itemId);
      if (foundIdx != -1) {
        final current = _items[foundIdx];
        final newStock = (current.stock - bItem.quantity).clamp(0.0, 99999.0);
        _items[foundIdx] = current.copyWith(stock: newStock);
      }
    }

    _bills.insert(0, bill);
    notifyListeners();
    return bill;
  }

  // Settings
  void updateProfile({
    String? name,
    String? tagline,
    String? phone,
    String? address,
    String? gstin,
    double? taxRatePercent,
    String? currencySymbol,
    bool? enableGstByDefault,
  }) {
    if (name != null) _profile.name = name;
    if (tagline != null) _profile.tagline = tagline;
    if (phone != null) _profile.phone = phone;
    if (address != null) _profile.address = address;
    if (gstin != null) _profile.gstin = gstin;
    if (taxRatePercent != null) _profile.taxRatePercent = taxRatePercent;
    if (currencySymbol != null) _profile.currencySymbol = currencySymbol;
    if (enableGstByDefault != null) _profile.enableGstByDefault = enableGstByDefault;
    notifyListeners();
  }

  // Reporting
  ReportData getReportForRange({
    required DateTime start,
    required DateTime end,
  }) {
    final filtered = _bills.where((b) {
      return b.createdAt.isAfter(start.subtract(const Duration(milliseconds: 1))) &&
          b.createdAt.isBefore(end.add(const Duration(milliseconds: 1)));
    }).toList();

    double totalSales = 0;
    double totalItemsSold = 0;
    double totalDiscount = 0;
    final Map<PaymentMethod, double> paymentBreakdown = {
      PaymentMethod.cash: 0,
      PaymentMethod.upi: 0,
      PaymentMethod.card: 0,
      PaymentMethod.other: 0,
    };
    final Map<String, double> itemCounts = {};

    for (final bill in filtered) {
      totalSales += bill.grandTotal;
      totalDiscount += bill.discountAmount;
      paymentBreakdown[bill.paymentMethod] =
          (paymentBreakdown[bill.paymentMethod] ?? 0) + bill.grandTotal;

      for (final item in bill.items) {
        totalItemsSold += item.quantity;
        itemCounts[item.name] = (itemCounts[item.name] ?? 0.0) + item.quantity;
      }
    }

    final sortedItems = itemCounts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return ReportData(
      totalSales: totalSales,
      totalBills: filtered.length,
      totalItemsSold: totalItemsSold,
      totalDiscount: totalDiscount,
      paymentBreakdown: paymentBreakdown,
      topSellingItems: sortedItems.take(5).toList(),
    );
  }

  // ==========================================
  // Developer Admin Panel & Shop Owner Management
  // Password: AppConstants.developerAdminPassword ("adminshiv.developer9142")
  // ==========================================

  bool verifyDeveloperAdminPassword(String password) {
    return password.trim() == AppConstants.developerAdminPassword;
  }

  ShopOwner registerShopOwner({
    String? shopId,
    required String ownerName,
    required String email,
    required String phone,
    required String pin,
    required String shopName,
    required String address,
    String gstin = '',
    double taxRate = 5.0,
  }) {
    final assignedShopId = (shopId != null && shopId.trim().isNotEmpty)
        ? shopId.trim().toUpperCase()
        : 'SB-${1000 + _shopOwners.length + 1}';
    final newId = assignedShopId;
    final newOwner = ShopOwner(
      id: newId,
      shopId: assignedShopId,
      ownerName: ownerName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      pin: pin.trim(),
      shopName: shopName.trim(),
      address: address.trim(),
      gstin: gstin.trim(),
      registeredAt: DateTime.now(),
      isActive: true,
      totalBillsCount: 0,
      totalRevenue: 0.0,
    );

    _shopOwners.insert(0, newOwner);

    // Also register an AppUser so the new owner can log into the POS terminal with their 4-digit PIN immediately
    final existingUserIdx = _users.indexWhere((u) => u.pin == newOwner.pin);
    if (existingUserIdx == -1) {
      _users.add(AppUser(
        id: 'u_${newOwner.id}',
        name: newOwner.ownerName,
        email: newOwner.email,
        pin: newOwner.pin,
        role: UserRole.owner,
      ));
    }

    notifyListeners();
    return newOwner;
  }

  void updateShopOwner(ShopOwner updated) {
    final idx = _shopOwners.indexWhere((so) => so.id == updated.id);
    if (idx != -1) {
      final old = _shopOwners[idx];
      _shopOwners[idx] = updated;

      // Update matching user
      final userIdx = _users.indexWhere((u) => u.pin == old.pin || u.email == old.email);
      if (userIdx != -1) {
        _users[userIdx] = AppUser(
          id: _users[userIdx].id,
          name: updated.ownerName,
          email: updated.email,
          pin: updated.pin,
          role: UserRole.owner,
        );
      }

      // If active shop profile is this owner, update shop profile
      if (_profile.name == old.shopName) {
        _profile.name = updated.shopName;
        _profile.phone = updated.phone;
        _profile.address = updated.address;
        _profile.gstin = updated.gstin;
      }

      notifyListeners();
    }
  }

  void toggleShopOwnerStatus(String id) {
    final idx = _shopOwners.indexWhere((so) => so.id == id);
    if (idx != -1) {
      final cur = _shopOwners[idx];
      cur.isActive = !cur.isActive;
      notifyListeners();
    }
  }

  void deleteShopOwner(String id) {
    final idx = _shopOwners.indexWhere((so) => so.id == id);
    if (idx != -1) {
      final owner = _shopOwners[idx];
      _shopOwners.removeAt(idx);
      _users.removeWhere((u) => u.pin == owner.pin);
      notifyListeners();
    }
  }

  void switchActiveShop(ShopOwner owner) {
    _profile.name = owner.shopName;
    _profile.phone = owner.phone;
    _profile.address = owner.address;
    _profile.gstin = owner.gstin;

    _currentUser = AppUser(
      id: 'u_${owner.id}',
      name: owner.ownerName,
      email: owner.email,
      pin: owner.pin,
      role: UserRole.owner,
    );

    notifyListeners();
  }
}
