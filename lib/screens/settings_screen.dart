import 'package:flutter/material.dart';
import '../data/shop_repository.dart';
import '../widgets/custom_text_field.dart';
import 'admin_login_screen.dart';
import 'login_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _nameController;
  late TextEditingController _taglineController;
  late TextEditingController _phoneController;
  late TextEditingController _addressController;
  late TextEditingController _gstinController;
  late TextEditingController _taxRateController;
  late TextEditingController _currencyController;
  bool _enableGstByDefault = false;

  @override
  void initState() {
    super.initState();
    final p = ShopRepository.instance.profile;
    _nameController = TextEditingController(text: p.name);
    _taglineController = TextEditingController(text: p.tagline);
    _phoneController = TextEditingController(text: p.phone);
    _addressController = TextEditingController(text: p.address);
    _gstinController = TextEditingController(text: p.gstin);
    _taxRateController = TextEditingController(text: p.taxRatePercent.toStringAsFixed(1));
    _currencyController = TextEditingController(text: p.currencySymbol);
    _enableGstByDefault = p.enableGstByDefault;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _taglineController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    _gstinController.dispose();
    _taxRateController.dispose();
    _currencyController.dispose();
    super.dispose();
  }

  void _saveProfile() {
    if (!_formKey.currentState!.validate()) return;

    final tax = double.tryParse(_taxRateController.text.trim()) ?? 5.0;
    ShopRepository.instance.updateProfile(
      name: _nameController.text.trim(),
      tagline: _taglineController.text.trim(),
      phone: _phoneController.text.trim(),
      address: _addressController.text.trim(),
      gstin: _gstinController.text.trim(),
      taxRatePercent: tax,
      currencySymbol: _currencyController.text.trim(),
      enableGstByDefault: _enableGstByDefault,
    );

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Shop settings updated successfully!')),
    );
  }

  void _confirmResetData() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset Demo Data?'),
        content: const Text(
          'This will reset items, bills, and settings back to default in-memory sample data.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              ShopRepository.instance.resetToDefaults();
              Navigator.of(ctx).pop();
              final p = ShopRepository.instance.profile;
              _nameController.text = p.name;
              _taglineController.text = p.tagline;
              _phoneController.text = p.phone;
              _addressController.text = p.address;
              _gstinController.text = p.gstin;
              _taxRateController.text = p.taxRatePercent.toStringAsFixed(1);
              _currencyController.text = p.currencySymbol;

              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Reset to demo sample data complete.')),
              );
            },
            child: const Text('Reset Data'),
          ),
        ],
      ),
    );
  }

  void _logout() {
    ShopRepository.instance.logout();
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final user = ShopRepository.instance.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Shop & App Settings'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // User Card
            Card(
              elevation: 0,
              color: theme.colorScheme.primaryContainer.withOpacity(0.4),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 24,
                      backgroundColor: theme.colorScheme.primary,
                      child: Text(
                        user?.name.isNotEmpty == true ? user!.name[0].toUpperCase() : 'U',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.name ?? 'Not Logged In',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            user?.roleDisplayName ?? '',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: _logout,
                      icon: const Icon(Icons.logout, size: 16),
                      label: const Text('Logout'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Shop Details Section
            Text(
              'Shop Information (Printed on Bills)',
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),

            Form(
              key: _formKey,
              child: Column(
                children: [
                  CustomTextField(
                    controller: _nameController,
                    label: 'Shop Name *',
                    prefixIcon: Icons.store,
                    validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                  ),
                  const SizedBox(height: 12),
                  CustomTextField(
                    controller: _taglineController,
                    label: 'Tagline / Slogan',
                    prefixIcon: Icons.format_quote,
                  ),
                  const SizedBox(height: 12),
                  CustomTextField(
                    controller: _phoneController,
                    label: 'Phone Number',
                    prefixIcon: Icons.phone,
                    keyboardType: TextInputType.phone,
                  ),
                  const SizedBox(height: 12),
                  CustomTextField(
                    controller: _addressController,
                    label: 'Shop Address',
                    prefixIcon: Icons.location_on_outlined,
                    maxLines: 2,
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: CustomTextField(
                          controller: _gstinController,
                          label: 'GSTIN / Tax ID',
                          prefixIcon: Icons.badge_outlined,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: CustomTextField(
                          controller: _taxRateController,
                          label: 'Tax Rate (%)',
                          prefixIcon: Icons.percent,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  CustomTextField(
                    controller: _currencyController,
                    label: 'Currency Symbol',
                    prefixIcon: Icons.monetization_on_outlined,
                  ),
                  const SizedBox(height: 12),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Enable GST by Default on New Bills', style: TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: const Text('When disabled, bills have 0% GST unless manually toggled during billing.', style: TextStyle(fontSize: 12)),
                    value: _enableGstByDefault,
                    onChanged: (val) {
                      setState(() {
                        _enableGstByDefault = val;
                      });
                    },
                  ),
                  const SizedBox(height: 20),

                  FilledButton.icon(
                    onPressed: _saveProfile,
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.save),
                    label: const Text('Save Shop Settings', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),
            const Divider(),
            const SizedBox(height: 16),

            // In-Memory Data Controls
            Text(
              'Demo Data Management',
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Running entirely in-memory as configured (no remote database or online backend).',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 12),

            OutlinedButton.icon(
              onPressed: _confirmResetData,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: const Icon(Icons.refresh),
              label: const Text('Reset All Data to Factory Defaults'),
            ),
            const SizedBox(height: 24),
            Center(
              child: Text(
                'ShopBill POS v2.4.2 • Secure Multi-Store Terminal',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.outline,
                  fontSize: 11,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
