import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/theme/app_theme.dart';

class CropScreen extends StatefulWidget {
  const CropScreen({super.key});

  @override
  State<CropScreen> createState() => _CropScreenState();
}

class _CropScreenState extends State<CropScreen> {
  final _formKey = GlobalKey<FormState>();
  final _tempController = TextEditingController();
  final _humidityController = TextEditingController();
  final _rainfallController = TextEditingController();
  final _phController = TextEditingController();
  final _nitrogenController = TextEditingController();
  String _season = 'kharif';
  bool _isLoading = false;
  List<dynamic> _recommendations = [];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('ফসল পরামর্শ', style: GoogleFonts.notoSansBengali()),
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
                      Text('পরিবেশগত তথ্য দিন', style: GoogleFonts.notoSansBengali(fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 16),
                      _buildInput('তাপমাত্রা (°C)', _tempController, 'যেমন: 28'),
                      _buildInput('আর্দ্রতা (%)', _humidityController, 'যেমন: 70'),
                      _buildInput('বৃষ্টিপাত (mm)', _rainfallController, 'যেমন: 150'),
                      _buildInput('pH', _phController, 'যেমন: 6.5'),
                      _buildInput('নাইট্রোজেন (mg/kg)', _nitrogenController, 'যেমন: 40'),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: _season,
                        decoration: InputDecoration(
                          labelText: 'মৌসুম',
                          labelStyle: GoogleFonts.notoSansBengali(),
                        ),
                        items: [
                          DropdownMenuItem(value: 'kharif', child: Text('খরিফ (গ্রীষ্ম)', style: GoogleFonts.notoSansBengali())),
                          DropdownMenuItem(value: 'rabi', child: Text('রবি (শীত)', style: GoogleFonts.notoSansBengali())),
                          DropdownMenuItem(value: 'summer', child: Text('গ্রীষ্মকাল', style: GoogleFonts.notoSansBengali())),
                        ],
                        onChanged: (v) => setState(() => _season = v!),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: ElevatedButton(
                          onPressed: _isLoading ? null : _getRecommendations,
                          child: _isLoading
                              ? const CircularProgressIndicator(color: Colors.white)
                              : Text('ফসল পরামর্শ দিন', style: GoogleFonts.notoSansBengali()),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (_recommendations.isNotEmpty) ...[
                const SizedBox(height: 24),
                Text('শীর্ষ ৫টি সুপারিশকৃত ফসল', style: GoogleFonts.notoSansBengali(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                ...List.generate(_recommendations.length, (i) => _buildCropCard(_recommendations[i], i + 1)),
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
        decoration: InputDecoration(labelText: label, hintText: hint, labelStyle: GoogleFonts.notoSansBengali()),
        validator: (v) => v!.isEmpty ? 'দিন' : null,
      ),
    );
  }

  Future<void> _getRecommendations() async {
    if (_formKey.currentState!.validate()) {
      setState(() => _isLoading = true);
      await Future.delayed(const Duration(seconds: 2));
      setState(() {
        _isLoading = false;
        _recommendations = [
          {'name_bn': 'ধান', 'confidence': 0.92, 'profit_score': 78, 'season': 'খরিফ', 'growth_days': 120, 'avg_price': 55},
          {'name_bn': 'পাট', 'confidence': 0.85, 'profit_score': 82, 'season': 'খরিফ', 'growth_days': 150, 'avg_price': 40},
          {'name_bn': 'সবুজ মরিচা', 'confidence': 0.78, 'profit_score': 88, 'season': 'খরিফ', 'growth_days': 90, 'avg_price': 80},
          {'name_bn': 'তরমুজ', 'confidence': 0.72, 'profit_score': 75, 'season': 'গ্রীষ্ম', 'growth_days': 80, 'avg_price': 30},
          {'name_bn': 'ভর্তা কলা', 'confidence': 0.68, 'profit_score': 70, 'season': 'খরিফ', 'growth_days': 110, 'avg_price': 25},
        ];
      });
    }
  }

  Widget _buildCropCard(dynamic crop, int rank) {
    final colors = [Colors.green, Colors.blue, Colors.orange, Colors.purple, Colors.teal];
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: colors[rank - 1].withOpacity(0.1),
          child: Text('$rank', style: TextStyle(color: colors[rank - 1], fontWeight: FontWeight.bold)),
        ),
        title: Text(crop['name_bn'], style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold)),
        subtitle: Text('আত্মবিশ্বাস: ${(crop['confidence'] * 100).toStringAsFixed(0)}%', style: GoogleFonts.notoSansBengali()),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('লাভ স্কোর', style: GoogleFonts.notoSansBengali(fontSize: 10)),
            Text('${crop['profit_score']}', style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _tempController.dispose();
    _humidityController.dispose();
    _rainfallController.dispose();
    _phController.dispose();
    _nitrogenController.dispose();
    super.dispose();
  }
}
