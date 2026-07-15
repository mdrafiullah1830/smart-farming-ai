import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/theme/app_theme.dart';

class MarketScreen extends StatelessWidget {
  const MarketScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('বাজার বিশ্লেষণ', style: GoogleFonts.notoSansBengali())),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              color: AppTheme.primaryColor,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('আজকের বাজার সারসংক্ষেপ', style: GoogleFonts.notoSansBengali(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _marketStat('ধান', '৫৫ টাকা/কেজি', '↑', Colors.green),
                        _marketStat('গম', '৪০ টাকা/কেজি', '→', Colors.yellow),
                        _marketStat('পাট', '৩৫ টাকা/কেজি', '↑', Colors.green),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('জনপ্রিয় ফসলের দাম', style: GoogleFonts.notoSansBengali(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            _priceCard('ধান (বোরো)', 55, 52, 58, 'stable'),
            _priceCard('গম', 40, 38, 43, 'up'),
            _priceCard('আলু', 30, 28, 35, 'down'),
            _priceCard('পেঁয়াজ', 45, 40, 50, 'up'),
            _priceCard('টমেটো', 50, 45, 55, 'stable'),
            _priceCard('মরিচ', 80, 75, 90, 'up'),
          ],
        ),
      ),
    );
  }

  Widget _marketStat(String name, String price, String trend, Color trendColor) {
    return Column(
      children: [
        Text(name, style: GoogleFonts.notoSansBengali(color: Colors.white70)),
        const SizedBox(height: 4),
        Text(price, style: GoogleFonts.notoSansBengali(color: Colors.white, fontWeight: FontWeight.bold)),
        Text(trend, style: TextStyle(color: trendColor, fontSize: 20)),
      ],
    );
  }

  Widget _priceCard(String name, double current, double min, double max, String trend) {
    final trendColors = {'up': Colors.green, 'down': Colors.red, 'stable': Colors.orange};
    final trendIcons = {'up': Icons.trending_up, 'down': Icons.trending_down, 'stable': Icons.trending_flat};
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(Icons.agriculture, color: AppTheme.primaryColor),
        title: Text(name, style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.w600)),
        subtitle: Text('সর্বনিম্ন: $min | সর্বোচ্চ: $max', style: GoogleFonts.notoSansBengali(fontSize: 12)),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('$current টাকা', style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold)),
            Icon(trendIcons[trend], color: trendColors[trend], size: 20),
          ],
        ),
      ),
    );
  }
}
