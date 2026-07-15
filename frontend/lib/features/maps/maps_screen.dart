import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/theme/app_theme.dart';

class MapsScreen extends StatelessWidget {
  const MapsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('মানচিত্র', style: GoogleFonts.notoSansBengali())),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.map, size: 80, color: AppTheme.primaryColor.withOpacity(0.3)),
            const SizedBox(height: 16),
            Text('মানচিত্র লোড হচ্ছে...', style: GoogleFonts.notoSansBengali(fontSize: 18)),
            const SizedBox(height: 8),
            Text(
              'আপনার ফার্মের অবস্থান এবং আশেপাশের তথ্য দেখুন',
              style: GoogleFonts.notoSansBengali(color: AppTheme.textSecondary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.my_location),
              label: Text('আমার অবস্থান', style: GoogleFonts.notoSansBengali()),
            ),
          ],
        ),
      ),
    );
  }
}
