import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/theme/app_theme.dart';

class SoilScreen extends StatefulWidget {
  const SoilScreen({super.key});

  @override
  State<SoilScreen> createState() => _SoilScreenState();
}

class _SoilScreenState extends State<SoilScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phController = TextEditingController();
  final _nitrogenController = TextEditingController();
  final _phosphorusController = TextEditingController();
  final _potassiumController = TextEditingController();
  final _moistureController = TextEditingController();
  bool _isLoading = false;
  Map<String, dynamic>? _result;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('মাটি বিশ্লেষণ', style: GoogleFonts.notoSansBengali()),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('মাটির মান দিন', style: GoogleFonts.notoSansBengali(fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 16),
                      _buildInput('pH মান', _phController, 'যেমন: 6.5'),
                      _buildInput('নাইট্রোজেন (mg/kg)', _nitrogenController, 'যেমন: 40'),
                      _buildInput('ফসফরাস (mg/kg)', _phosphorusController, 'যেমন: 25'),
                      _buildInput('পটাশিয়াম (mg/kg)', _potassiumController, 'যেমন: 150'),
                      _buildInput('আর্দ্রতা (%)', _moistureController, 'যেমন: 30'),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: ElevatedButton(
                          onPressed: _isLoading ? null : _analyzeSoil,
                          child: _isLoading
                              ? const CircularProgressIndicator(color: Colors.white)
                              : Text('বিশ্লেষণ করুন', style: GoogleFonts.notoSansBengali()),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (_result != null) ...[
                const SizedBox(height: 24),
                _buildResult(),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInput(String label, TextEditingController controller, String hint) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: controller,
        keyboardType: TextInputType.number,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          labelStyle: GoogleFonts.notoSansBengali(),
        ),
        validator: (v) => v!.isEmpty ? 'দিন' : null,
      ),
    );
  }

  Future<void> _analyzeSoil() async {
    if (_formKey.currentState!.validate()) {
      setState(() => _isLoading = true);
      await Future.delayed(const Duration(seconds: 2));
      setState(() {
        _isLoading = false;
        _result = {
          'health_score': 72.5,
          'health_label': 'Good',
          'health_label_bn': 'ভালো',
          'suitable_crops': [
            {'name_bn': 'ধান', 'match_score': 85},
            {'name_bn': 'গম', 'match_score': 78},
            {'name_bn': 'আলু', 'match_score': 72},
          ],
          'fertilizer_recommendations': [
            {'name_bn': 'ইউরিয়া', 'amount_kg_per_acre': 50, 'purpose': 'নাইট্রোজেন সম্পূরক'},
            {'name_bn': 'টিএসপি', 'amount_kg_per_acre': 30, 'purpose': 'ফসফরাস সম্পূরক'},
          ],
        };
      });
    }
  }

  Widget _buildResult() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('বিশ্লেষণের ফলাফল', style: GoogleFonts.notoSansBengali(fontSize: 18, fontWeight: FontWeight.bold)),
            const Divider(),
            Row(
              children: [
                SizedBox(
                  width: 80,
                  height: 80,
                  child: CircularProgressIndicator(
                    value: (_result!['health_score'] as num) / 100,
                    strokeWidth: 8,
                    color: AppTheme.primaryColor,
                    backgroundColor: Colors.grey[200],
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('মাটির স্বাস্থ্য স্কোর', style: GoogleFonts.notoSansBengali(fontSize: 14)),
                      Text(
                        '${_result!['health_score']}% - ${_result!['health_label_bn']}',
                        style: GoogleFonts.notoSansBengali(fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text('উপযুক্ত ফসল', style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold)),
            ...(_result!['suitable_crops'] as List).map((c) => ListTile(
              leading: const Icon(Icons.eco, color: AppTheme.primaryColor),
              title: Text(c['name_bn'], style: GoogleFonts.notoSansBengali()),
              trailing: Text('${c['match_score']}%', style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold)),
            )),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _phController.dispose();
    _nitrogenController.dispose();
    _phosphorusController.dispose();
    _potassiumController.dispose();
    _moistureController.dispose();
    super.dispose();
  }
}
