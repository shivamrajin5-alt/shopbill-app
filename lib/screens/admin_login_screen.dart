import 'package:flutter/material.dart';
import '../data/shop_repository.dart';
import '../utils/constants.dart';
import 'admin_panel_screen.dart';

class AdminLoginScreen extends StatefulWidget {
  const AdminLoginScreen({super.key});

  @override
  State<AdminLoginScreen> createState() => _AdminLoginScreenState();
}

class _AdminLoginScreenState extends State<AdminLoginScreen> {
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  String? _errorMessage;
  bool _isLoading = false;

  @override
  void dispose() {
    _passwordController.dispose();
    super.dispose();
  }

  void _verifyAndLogin() {
    final entered = _passwordController.text.trim();
    if (entered.isEmpty) {
      setState(() => _errorMessage = 'Please enter developer password');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final isValid = ShopRepository.instance.verifyDeveloperAdminPassword(entered);

    if (isValid) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const AdminPanelScreen()),
      );
    } else {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Access Denied: Invalid Developer Admin Password.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A), // Dark slate developer theme
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white70),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(28.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Developer Security Icon
                  Center(
                    child: Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        shape: BoxShape.circle,
                        border: Border.all(color: const Color(0xFF38BDF8).withOpacity(0.4), width: 2),
                      ),
                      child: const Icon(
                        Icons.admin_panel_settings,
                        size: 54,
                        color: Color(0xFF38BDF8),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  const Text(
                    'Developer Admin Console',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Multi-tenant shop owner registration & management',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.65),
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Password Field
                  TextField(
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
                    decoration: InputDecoration(
                      labelText: 'Developer Password',
                      labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
                      hintText: 'Enter developer admin password',
                      hintStyle: TextStyle(color: Colors.white.withOpacity(0.3)),
                      prefixIcon: const Icon(Icons.key, color: Color(0xFF38BDF8)),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword ? Icons.visibility_off : Icons.visibility,
                          color: const Color(0xFF94A3B8),
                        ),
                        onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                      ),
                      filled: true,
                      fillColor: const Color(0xFF1E293B),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: Color(0xFF334155)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: Color(0xFF334155)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: Color(0xFF38BDF8), width: 2),
                      ),
                    ),
                    onSubmitted: (_) => _verifyAndLogin(),
                  ),

                  if (_errorMessage != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.red.shade900.withOpacity(0.4),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.red.shade400.withOpacity(0.5)),
                      ),
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 12),
                      ),
                    ),
                  ],

                  const SizedBox(height: 24),

                  FilledButton(
                    onPressed: _isLoading ? null : _verifyAndLogin,
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF0284C7),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                          )
                        : const Text(
                            'Authorize & Open Admin Panel',
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
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
