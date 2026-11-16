enum UserRole { owner, employee }

class AppUser {
  final String id;
  final String name;
  final String email;
  final String pin;
  final UserRole role;

  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.pin,
    required this.role,
  });

  bool get isOwner => role == UserRole.owner;
  String get roleDisplayName => isOwner ? 'Shop Owner' : 'Shop Employee';
}
