import 'package:flutter/material.dart';
import '../data/shop_repository.dart';
import '../utils/constants.dart';
import '../widgets/custom_text_field.dart';
import 'admin_login_screen.dart';
import 'home_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _shopIdController = TextEditingController();
  final _pinController = TextEditingController();
  String? _errorMessage;
  bool _isLoading = false;

  void _handleLogin() {
    setState(() {
      _errorMessage = null;
      _isLoading = true;
    });

    final res = ShopRepository.instance.loginWithShopIdAndPin(
      _shopIdController.text.trim(),
      _pinController.text.trim(),
    );

    if (res['success'] == true) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      );
    } else {
      setState(() {
        _errorMessage = res['error'] as String? ?? 'Login failed. Please check credentials.';
        _isLoading = false;
      });
    }
  }

  void _openDeveloperPrompt() {
    final devKeyCtrl = TextEditingController();
    String? devError;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.security, color: Colors.blue),
              SizedBox(width: 8),
              Text('Developer Access', style: TextStyle(fontSize: 16)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Restricted developer area. Enter developer password to access admin console:',
                style: TextStyle(fontSize: 12),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: devKeyCtrl,
                obscureText: true,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: 'Developer Key',
                  hintText: 'Enter developer password',
                  errorText: devError,
                  border: const OutlineInputBorder(),
                  isDense: true,
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
                if (devKeyCtrl.text.trim() == AppConstants.developerAdminPassword) {
                  Navigator.of(ctx).pop();
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const AdminLoginScreen()),
                  );
                } else {
                  setModalState(() {
                    devError = 'Invalid developer password';
                  });
                }
              },
              child: const Text('Unlock'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _shopIdController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(28.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // App Icon
                  Center(
                    child: Container(
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primaryContainer,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [
                          BoxShadow(
                            color: theme.colorScheme.primary.withOpacity(0.15),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Icon(
                        Icons.store_mall_directory_rounded,
                        size: 48,
                        color: theme.colorScheme.onPrimaryContainer,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Welcome to ${AppConstants.appName}',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Sign in with your Shop ID and Staff PIN',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 28),

                  // Shop ID Input
                  CustomTextField(
                    controller: _shopIdController,
                    label: 'Shop ID',
                    hint: 'e.g. SB-1001',
                    prefixIcon: Icons.badge_outlined,
                    keyboardType: TextInputType.text,
                    textCapitalization: TextCapitalization.characters,
                  ),
                  const SizedBox(height: 16),

                  // PIN Input
                  CustomTextField(
                    controller: _pinController,
                    label: 'Staff PIN (4 Digits)',
                    hint: 'Enter 4-digit PIN',
                    prefixIcon: Icons.lock_outline,
                    keyboardType: TextInputType.number,
                    obscureText: true,
                  ),
                  if (_errorMessage != null) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.errorContainer.withOpacity(0.6),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _errorMessage!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.error,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],

                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _isLoading ? null : _handleLogin,
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text(
                            'Log In to Shop',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                  ),

                  const SizedBox(height: 28),
                  // Discreet Footer with subtle developer unlock key
                  Center(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          'ShopBill POS v2.4',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.outline,
                            fontSize: 11,
                          ),
                        ),
                        const SizedBox(width: 4),
                        IconButton(
                          icon: const Icon(Icons.key, size: 12),
                          color: theme.colorScheme.outlineVariant,
                          tooltip: 'Developer Gateway',
                          onPressed: _openDeveloperPrompt,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
