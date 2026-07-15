import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/theme/app_theme.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('বিজ্ঞপ্তি', style: GoogleFonts.notoSansBengali()),
        actions: [
          TextButton(
            onPressed: () {},
            child: Text('সব পড়ুন', style: GoogleFonts.notoSansBengali(color: Colors.white)),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _notificationCard(
            'বৃষ্টি সতর্কতা', 'আগামী ২৪ ঘণ্টায় ভারী বৃষ্টির সম্ভাবনা',
            Icons.cloud, Colors.blue, 'warning', '2 ঘণ্টা আগে',
          ),
          _notificationCard(
            'ফসল ফসল রিমাইন্ডার', 'ধান ফসল তোলার সময় হয়েছে',
            Icons.agriculture, AppTheme.primaryColor, 'info', '5 ঘণ্টা আগে',
          ),
          _notificationCard(
            'বাজার আপডেট', 'ধানের দাম ৫% বেড়েছে',
            Icons.trending_up, Colors.green, 'info', '1 দিন আগে',
          ),
          _notificationCard(
            'সার রিমাইন্ডার', 'গম ফসলে সার প্রয়োগের সময়',
            Icons.science, Colors.orange, 'info', '2 দিন আগে',
          ),
          _notificationCard(
            'ঘূর্ণিঝড় সতর্কতা', 'উপকূলীয় এলাকায় ঘূর্ণিঝড়ের ঝুঁকি',
            Icons.warning, Colors.red, 'critical', '3 দিন আগে',
          ),
        ],
      ),
    );
  }

  Widget _notificationCard(String title, String message, IconData icon, Color color, String severity, String time) {
    final severityColors = {'info': Colors.blue, 'warning': Colors.orange, 'critical': Colors.red};
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withOpacity(0.1),
          child: Icon(icon, color: color),
        ),
        title: Text(title, style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.w600)),
        subtitle: Text(message, style: GoogleFonts.notoSansBengali(fontSize: 12)),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: severityColors[severity], shape: BoxShape.circle),
            ),
            const SizedBox(height: 4),
            Text(time, style: GoogleFonts.notoSansBengali(fontSize: 10, color: AppTheme.textSecondary)),
          ],
        ),
      ),
    );
  }
}
