class ShopOwner {
  final String id;
  final String shopId; // e.g. SB-1001
  String ownerName;
  String email;
  String phone;
  String pin;
  String shopName;
  String address;
  String gstin;
  final DateTime registeredAt;
  bool isActive;
  int totalBillsCount;
  double totalRevenue;

  ShopOwner({
    required this.id,
    required this.shopId,
    required this.ownerName,
    required this.email,
    required this.phone,
    required this.pin,
    required this.shopName,
    required this.address,
    this.gstin = '',
    required this.registeredAt,
    this.isActive = true,
    this.totalBillsCount = 0,
    this.totalRevenue = 0.0,
  });

  ShopOwner copyWith({
    String? id,
    String? shopId,
    String? ownerName,
    String? email,
    String? phone,
    String? pin,
    String? shopName,
    String? address,
    String? gstin,
    DateTime? registeredAt,
    bool? isActive,
    int? totalBillsCount,
    double? totalRevenue,
  }) {
    return ShopOwner(
      id: id ?? this.id,
      shopId: shopId ?? this.shopId,
      ownerName: ownerName ?? this.ownerName,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      pin: pin ?? this.pin,
      shopName: shopName ?? this.shopName,
      address: address ?? this.address,
      gstin: gstin ?? this.gstin,
      registeredAt: registeredAt ?? this.registeredAt,
      isActive: isActive ?? this.isActive,
      totalBillsCount: totalBillsCount ?? this.totalBillsCount,
      totalRevenue: totalRevenue ?? this.totalRevenue,
    );
  }
}
