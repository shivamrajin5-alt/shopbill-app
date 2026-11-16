import 'package:flutter/material.dart';
import '../data/shop_repository.dart';
import '../models/shop_owner.dart';
import '../utils/currency_formatter.dart';
import 'home_screen.dart';
import 'login_screen.dart';

class AdminPanelScreen extends StatefulWidget {
  const AdminPanelScreen({super.key});

  @override
  State<AdminPanelScreen> createState() => _AdminPanelScreenState();
}

class _AdminPanelScreenState extends State<AdminPanelScreen> {
  final _searchController = TextEditingController();
  final Set<String> _revealedPins = {};

  @override
  void initState() {
    super.initState();
    ShopRepository.instance.addListener(_onUpdate);
  }

  @override
  void dispose() {
    ShopRepository.instance.removeListener(_onUpdate);
    _searchController.dispose();
    super.dispose();
  }

  void _onUpdate() {
    if (mounted) setState(() {});
  }

  void _showRegisterOwnerDialog({ShopOwner? editingOwner}) {
    final isEditing = editingOwner != null;
    final nameCtrl = TextEditingController(text: editingOwner?.ownerName ?? '');
    final emailCtrl = TextEditingController(text: editingOwner?.email ?? '');
    final phoneCtrl = TextEditingController(text: editingOwner?.phone ?? '');
    final pinCtrl = TextEditingController(text: editingOwner?.pin ?? '1234');
    final shopNameCtrl = TextEditingController(text: editingOwner?.shopName ?? '');
    final addressCtrl = TextEditingController(text: editingOwner?.address ?? '');
    final gstinCtrl = TextEditingController(text: editingOwner?.gstin ?? '');

    final formKey = GlobalKey<FormState>();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (modalCtx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 16,
            bottom: MediaQuery.of(modalCtx).viewInsets.bottom + 20,
          ),
          child: Form(
            key: formKey,
            child: SingleChildScrollView(
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
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        isEditing ? 'Edit Shop Owner' : 'Register New Shop Owner',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.of(modalCtx).pop(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Owner Full Name
                  TextFormField(
                    controller: nameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Owner Full Name *',
                      prefixIcon: Icon(Icons.person),
                      border: OutlineInputBorder(),
                    ),
                    validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
                  ),
                  const SizedBox(height: 12),

                  // Shop / Business Name
                  TextFormField(
                    controller: shopNameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Shop / Business Name *',
                      prefixIcon: Icon(Icons.store),
                      border: OutlineInputBorder(),
                    ),
                    validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
                  ),
                  const SizedBox(height: 12),

                  // Phone & 4-Digit PIN
                  Row(
                    children: [
                      Expanded(
                        flex: 6,
                        child: TextFormField(
                          controller: phoneCtrl,
                          keyboardType: TextInputType.phone,
                          decoration: const InputDecoration(
                            labelText: 'Phone Number *',
                            prefixIcon: Icon(Icons.phone),
                            border: OutlineInputBorder(),
                          ),
                          validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 4,
                        child: TextFormField(
                          controller: pinCtrl,
                          keyboardType: TextInputType.number,
                          maxLength: 4,
                          decoration: const InputDecoration(
                            labelText: 'Login PIN *',
                            counterText: '',
                            prefixIcon: Icon(Icons.lock_outline),
                            border: OutlineInputBorder(),
                          ),
                          validator: (v) {
                            if (v == null || v.trim().length != 4) return '4 digits';
                            return null;
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Email
                  TextFormField(
                    controller: emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      labelText: 'Email Address *',
                      prefixIcon: Icon(Icons.email_outlined),
                      border: OutlineInputBorder(),
                    ),
                    validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
                  ),
                  const SizedBox(height: 12),

                  // Address
                  TextFormField(
                    controller: addressCtrl,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'Shop Address *',
                      prefixIcon: Icon(Icons.location_on_outlined),
                      border: OutlineInputBorder(),
                    ),
                    validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
                  ),
                  const SizedBox(height: 12),

                  // GSTIN
                  TextFormField(
                    controller: gstinCtrl,
                    decoration: const InputDecoration(
                      labelText: 'GSTIN (Optional)',
                      prefixIcon: Icon(Icons.badge_outlined),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 20),

                  FilledButton.icon(
                    onPressed: () {
                      if (!formKey.currentState!.validate()) return;
                      final repo = ShopRepository.instance;

                      if (isEditing) {
                        final updated = editingOwner.copyWith(
                          ownerName: nameCtrl.text.trim(),
                          email: emailCtrl.text.trim(),
                          phone: phoneCtrl.text.trim(),
                          pin: pinCtrl.text.trim(),
                          shopName: shopNameCtrl.text.trim(),
                          address: addressCtrl.text.trim(),
                          gstin: gstinCtrl.text.trim(),
                        );
                        repo.updateShopOwner(updated);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Shop Owner ${updated.ownerName} updated')),
                        );
                      } else {
                        final created = repo.registerShopOwner(
                          ownerName: nameCtrl.text.trim(),
                          email: emailCtrl.text.trim(),
                          phone: phoneCtrl.text.trim(),
                          pin: pinCtrl.text.trim(),
                          shopName: shopNameCtrl.text.trim(),
                          address: addressCtrl.text.trim(),
                          gstin: gstinCtrl.text.trim(),
                        );
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('New Shop Owner ${created.ownerName} registered!')),
                        );
                      }

                      Navigator.of(modalCtx).pop();
                    },
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.check),
                    label: Text(
                      isEditing ? 'Save Changes' : 'Register Shop Owner',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  void _confirmDeleteOwner(ShopOwner owner) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Shop Owner?'),
        content: Text(
          'Are you sure you want to remove ${owner.ownerName} (${owner.shopName})? This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () {
              ShopRepository.instance.deleteShopOwner(owner.id);
              Navigator.of(ctx).pop();
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Shop Owner ${owner.ownerName} deleted')),
              );
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  void _switchAndOpenShop(ShopOwner owner) {
    ShopRepository.instance.switchActiveShop(owner);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Switched to shop: ${owner.shopName}')),
    );
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const HomeScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final repo = ShopRepository.instance;
    final allOwners = repo.shopOwners;

    final query = _searchController.text.trim().toLowerCase();
    final filteredOwners = allOwners.where((so) {
      return query.isEmpty ||
          so.ownerName.toLowerCase().contains(query) ||
          so.shopName.toLowerCase().contains(query) ||
          so.phone.toLowerCase().contains(query) ||
          so.pin.contains(query);
    }).toList();

    final activeCount = allOwners.where((o) => o.isActive).length;
    final totalNetworkBills = allOwners.fold(0, (sum, o) => sum + o.totalBillsCount);
    final totalNetworkSales = allOwners.fold(0.0, (sum, o) => sum + o.totalRevenue);

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Developer Admin Console',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            Text(
              'ShopBill Central Multi-Shop Registry',
              style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.7)),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Exit Admin Panel',
            onPressed: () {
              Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const LoginScreen()),
                (route) => false,
              );
            },
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFF0284C7),
        foregroundColor: Colors.white,
        onPressed: () => _showRegisterOwnerDialog(),
        icon: const Icon(Icons.person_add),
        label: const Text('Register Shop Owner', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
        children: [
          // Developer Badge banner
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF38BDF8).withOpacity(0.3)),
            ),
            child: Row(
              children: [
                const Icon(Icons.verified_user, color: Color(0xFF38BDF8), size: 24),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Developer Authorized Session',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                      Text(
                        'Full control to register, inspect, and manage shop owners.',
                        style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 11),
                      ),
                    ],
                  ),
                ),
                ActionChip(
                  visualDensity: VisualDensity.compact,
                  backgroundColor: const Color(0xFF0F172A),
                  label: const Text('+ Register', style: TextStyle(color: Color(0xFF38BDF8), fontSize: 11)),
                  onPressed: () => _showRegisterOwnerDialog(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Overview KPI cards
          Row(
            children: [
              Expanded(
                child: _metricCard(
                  'Total Shop Owners',
                  '${allOwners.length}',
                  'Registered in system',
                  Icons.storefront,
                  Colors.blue,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _metricCard(
                  'Active Shops',
                  '$activeCount / ${allOwners.length}',
                  'Operational',
                  Icons.check_circle_outline,
                  Colors.green,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _metricCard(
                  'Network Bills',
                  '$totalNetworkBills bills',
                  'Across all stores',
                  Icons.receipt_long,
                  Colors.orange,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _metricCard(
                  'Network Revenue',
                  CurrencyFormatter.format(totalNetworkSales),
                  'Gross merchant sales',
                  Icons.currency_rupee,
                  Colors.teal,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Search Bar
          SearchBar(
            controller: _searchController,
            hintText: 'Search by owner, shop name, phone or PIN...',
            leading: const Icon(Icons.search),
            elevation: const WidgetStatePropertyAll(0),
            backgroundColor: WidgetStatePropertyAll(
              theme.colorScheme.surfaceVariant.withOpacity(0.4),
            ),
            trailing: [
              if (_searchController.text.isNotEmpty)
                IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () {
                    _searchController.clear();
                    setState(() {});
                  },
                ),
            ],
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 16),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Registered Shop Owners (${filteredOwners.length})',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
              ),
              Text(
                'Sorted by newest',
                style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey),
              ),
            ],
          ),
          const SizedBox(height: 10),

          if (filteredOwners.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(32.0),
                child: Column(
                  children: [
                    Icon(Icons.person_off_outlined, size: 48, color: Colors.grey.shade400),
                    const SizedBox(height: 12),
                    const Text('No shop owners match your search.'),
                  ],
                ),
              ),
            )
          else
            ...filteredOwners.map((owner) {
              final isPinRevealed = _revealedPins.contains(owner.id);

              return Card(
                elevation: 0,
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(
                    color: owner.isActive
                        ? theme.colorScheme.outlineVariant.withOpacity(0.6)
                        : Colors.red.shade200,
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header Row
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CircleAvatar(
                            radius: 22,
                            backgroundColor: owner.isActive
                                ? theme.colorScheme.primaryContainer
                                : Colors.grey.shade300,
                            child: Icon(
                              Icons.store,
                              color: owner.isActive ? theme.colorScheme.primary : Colors.grey.shade700,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: Colors.grey.shade200,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        owner.shopId,
                                        style: const TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.bold,
                                          fontFamily: 'monospace',
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    Flexible(
                                      child: Text(
                                        owner.shopName,
                                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: owner.isActive ? Colors.green.shade50 : Colors.red.shade50,
                                        borderRadius: BorderRadius.circular(4),
                                        border: Border.all(
                                          color: owner.isActive ? Colors.green.shade300 : Colors.red.shade300,
                                        ),
                                      ),
                                      child: Text(
                                        owner.isActive ? 'ACTIVE' : 'SUSPENDED',
                                        style: TextStyle(
                                          fontSize: 9,
                                          fontWeight: FontWeight.bold,
                                          color: owner.isActive ? Colors.green.shade800 : Colors.red.shade800,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Owner: ${owner.ownerName} • ${owner.phone}',
                                  style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                          PopupMenuButton<String>(
                            onSelected: (val) {
                              if (val == 'edit') {
                                _showRegisterOwnerDialog(editingOwner: owner);
                              } else if (val == 'toggle') {
                                repo.toggleShopOwnerStatus(owner.id);
                              } else if (val == 'delete') {
                                _confirmDeleteOwner(owner);
                              } else if (val == 'login') {
                                _switchAndOpenShop(owner);
                              }
                            },
                            itemBuilder: (ctx) => [
                              const PopupMenuItem(
                                value: 'login',
                                child: Row(
                                  children: [
                                    Icon(Icons.login, size: 18, color: Colors.green),
                                    SizedBox(width: 8),
                                    Text('Switch & Login to Shop'),
                                  ],
                                ),
                              ),
                              const PopupMenuItem(
                                value: 'edit',
                                child: Row(
                                  children: [
                                    Icon(Icons.edit, size: 18),
                                    SizedBox(width: 8),
                                    Text('Edit Details'),
                                  ],
                                ),
                              ),
                              PopupMenuItem(
                                value: 'toggle',
                                child: Row(
                                  children: [
                                    Icon(
                                      owner.isActive ? Icons.block : Icons.check_circle,
                                      size: 18,
                                      color: owner.isActive ? Colors.orange : Colors.green,
                                    ),
                                    const SizedBox(width: 8),
                                    Text(owner.isActive ? 'Suspend Shop' : 'Activate Shop'),
                                  ],
                                ),
                              ),
                              const PopupMenuItem(
                                value: 'delete',
                                child: Row(
                                  children: [
                                    Icon(Icons.delete, size: 18, color: Colors.red),
                                    SizedBox(width: 8),
                                    Text('Delete Owner', style: TextStyle(color: Colors.red)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      const Divider(height: 1),
                      const SizedBox(height: 10),

                      // Details Grid
                      Wrap(
                        spacing: 12,
                        runSpacing: 6,
                        children: [
                          _infoChip(Icons.email_outlined, owner.email),
                          _infoChip(Icons.location_on_outlined, owner.address),
                          if (owner.gstin.isNotEmpty) _infoChip(Icons.badge_outlined, 'GST: ${owner.gstin}'),
                          _infoChip(Icons.receipt_long, '${owner.totalBillsCount} bills recorded'),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Credentials bar & Switch action
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceVariant.withOpacity(0.35),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.key, size: 16, color: Colors.blueGrey),
                                const SizedBox(width: 6),
                                Text(
                                  'Staff PIN: ',
                                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                                ),
                                Text(
                                  isPinRevealed ? owner.pin : '••••',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                    fontFamily: 'monospace',
                                    letterSpacing: 2,
                                  ),
                                ),
                                IconButton(
                                  icon: Icon(
                                    isPinRevealed ? Icons.visibility_off : Icons.visibility,
                                    size: 16,
                                  ),
                                  onPressed: () {
                                    setState(() {
                                      if (isPinRevealed) {
                                        _revealedPins.remove(owner.id);
                                      } else {
                                        _revealedPins.add(owner.id);
                                      }
                                    });
                                  },
                                  visualDensity: VisualDensity.compact,
                                ),
                              ],
                            ),
                            FilledButton.tonalIcon(
                              onPressed: () => _switchAndOpenShop(owner),
                              style: FilledButton.styleFrom(
                                visualDensity: VisualDensity.compact,
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              ),
                              icon: const Icon(Icons.login, size: 14),
                              label: const Text('Open Shop', style: TextStyle(fontSize: 11)),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _metricCard(String title, String value, String subtitle, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(title, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
              Icon(icon, size: 16, color: color),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const SizedBox(height: 2),
          Text(
            subtitle,
            style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
          ),
        ],
      ),
    );
  }

  Widget _infoChip(IconData icon, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: Colors.grey.shade600),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            label,
            style: TextStyle(fontSize: 11, color: Colors.grey.shade700),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
