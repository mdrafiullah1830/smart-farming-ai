import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/theme/app_theme.dart';

class DiseaseScreen extends StatefulWidget {
  const DiseaseScreen({super.key});

  @override
  State<DiseaseScreen> createState() => _DiseaseScreenState();
}

class _DiseaseScreenState extends State<DiseaseScreen> {
  XFile? _image;
  bool _isLoading = false;
  Map<String, dynamic>? _result;
  final ImagePicker _picker = ImagePicker();

  Future<void> _pickImage(ImageSource source) async {
    final XFile? pickedFile = await _picker.pickImage(source: source, maxWidth: 1024, maxHeight: 1024, imageQuality: 85);
    if (pickedFile != null) {
      setState(() {
        _image = pickedFile;
        _result = null;
      });
      _detectDisease();
    }
  }

  Future<void> _detectDisease() async {
    if (_image == null) return;
    setState(() => _isLoading = true);
    await Future.delayed(const Duration(seconds: 3));
    setState(() {
      _isLoading = false;
      _result = {
        'disease_name_bn': 'ধানের ব্লাস্ট রোগ',
        'confidence': 0.87,
        'severity': 'high',
        'description_bn': 'পাতায় হীরার আকৃতির দাগ সৃষ্টিকারী ছত্রাক রোগ',
        'treatment': [
          {'name_bn': 'ট্রাইসাইক্লাজোল', 'dosage': '75WP @ 600g/হেক্টর'},
          {'name_bn': 'আইসোপ্রোথায়োলেন', 'dosage': '40EC @ 1.5L/হেক্টর'},
        ],
        'prevention_bn': ['প্রতিরোধী জাত ব্যবহার করুন', 'অতিরিক্ত নাইট্রোজেন এড়িয়ে চলুন', 'যথাযথ জল ব্যবস্থাপনা বজায় রাখুন'],
      };
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('রোগ সনাক্তকরণ', style: GoogleFonts.notoSansBengali())),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    if (_image != null)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.network(_image!.path, height: 200, width: double.infinity, fit: BoxFit.cover),
                      )
                    else
                      Container(
                        height: 200,
                        width: double.infinity,
                        decoration: BoxDecoration(
                          color: Colors.grey[100],
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.grey[300]!),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.camera_alt, size: 48, color: Colors.grey),
                            const SizedBox(height: 8),
                            Text('ছবি আপলোড করুন', style: GoogleFonts.notoSansBengali(color: Colors.grey)),
                          ],
                        ),
                      ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: () => _pickImage(ImageSource.camera),
                            icon: const Icon(Icons.camera_alt),
                            label: Text('ক্যামেরা', style: GoogleFonts.notoSansBengali()),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: () => _pickImage(ImageSource.gallery),
                            icon: const Icon(Icons.photo_library),
                            label: Text('গ্যালারি', style: GoogleFonts.notoSansBengali()),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            if (_isLoading) ...[
              const SizedBox(height: 24),
              const Center(child: CircularProgressIndicator()),
              const SizedBox(height: 8),
              Center(child: Text('রোগ বিশ্লেষণ করা হচ্ছে...', style: GoogleFonts.notoSansBengali())),
            ],
            if (_result != null) ...[
              const SizedBox(height: 24),
              _buildResult(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildResult() {
    final severityColors = {'low': Colors.green, 'medium': Colors.orange, 'high': Colors.red, 'critical': Colors.red[900]};
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.bug_report, color: severityColors[_result!['severity']], size: 32),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_result!['disease_name_bn'], style: GoogleFonts.notoSansBengali(fontSize: 18, fontWeight: FontWeight.bold)),
                      Text('আত্মবিশ্বাস: ${(_result!['confidence'] * 100).toStringAsFixed(0)}%', style: GoogleFonts.notoSansBengali()),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: severityColors[_result!['severity']]!.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    _result!['severity'] == 'high' ? 'গুরুতর' : 'মাঝারি',
                    style: TextStyle(color: severityColors[_result!['severity']], fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            const Divider(),
            Text('বিবরণ', style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold)),
            Text(_result!['description_bn'], style: GoogleFonts.notoSansBengali()),
            const SizedBox(height: 16),
            Text('চিকিৎসা', style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold)),
            ...(_result!['treatment'] as List).map((t) => ListTile(
              leading: const Icon(Icons.medication, color: AppTheme.primaryColor),
              title: Text(t['name_bn'], style: GoogleFonts.notoSansBengali()),
              subtitle: Text(t['dosage'], style: GoogleFonts.notoSansBengali(fontSize: 12)),
            )),
            const SizedBox(height: 16),
            Text('প্রতিরোধ', style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold)),
            ...(_result!['prevention_bn'] as List).map((p) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  const Icon(Icons.check_circle, color: AppTheme.successColor, size: 16),
                  const SizedBox(width: 8),
                  Expanded(child: Text(p, style: GoogleFonts.notoSansBengali())),
                ],
              ),
            )),
          ],
        ),
      ),
    );
  }
}
