import 'package:intl/intl.dart';
import 'constants.dart';

class CurrencyFormatter {
  static final NumberFormat _formatter = NumberFormat('#,##,##0.00', 'en_IN');

  static String format(double amount, {String symbol = AppConstants.currencySymbol}) {
    return '$symbol${_formatter.format(amount)}';
  }

  static String formatDate(DateTime dt) {
    return DateFormat('dd MMM yyyy, hh:mm a').format(dt);
  }

  static String formatDateShort(DateTime dt) {
    return DateFormat('dd MMM yyyy').format(dt);
  }

  static String formatTime(DateTime dt) {
    return DateFormat('hh:mm a').format(dt);
  }
}
