import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../providers/disease_provider.dart';

class DiseaseScreen extends StatefulWidget {
  const DiseaseScreen({super.key});

  @override
  State<DiseaseScreen> createState() => _DiseaseScreenState();
}

class _DiseaseScreenState extends State<DiseaseScreen> {
  XFile? _image;
  final ImagePicker _picker = ImagePicker();

  Future<void> _pickImage(ImageSource source) async {
    final XFile? pickedFile = await _picker.pickImage(source: source, maxWidth: 1024, maxHeight: 1024, imageQuality: 85);
    if (pickedFile != null) {
      setState(() => _image = pickedFile);
      if (mounted) {
        context.read<DiseaseProvider>().detectDisease(pickedFile.path);
      }
    }
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
                        child: Image.file(File(_image!.path), height: 200, width: double.infinity, fit: BoxFit.cover),
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
            Consumer<DiseaseProvider>(
              builder: (context, provider, child) {
                if (provider.isLoading) {
                  return const Padding(
                    padding: EdgeInsets.only(top: 24),
                    child: Center(
                      child: Column(
                        children: [
                          CircularProgressIndicator(),
                          SizedBox(height: 8),
                          Text('রোগ বিশ্লেষণ করা হচ্ছে...'),
                        ],
                      ),
                    ),
                  );
                }
                if (provider.errorMessage != null) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 24),
                    child: Card(
                      color: Colors.red[50],
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            const Icon(Icons.error_outline, color: Colors.red),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('ত্রুটি', style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold, color: Colors.red)),
                                  Text(provider.errorMessage!, style: GoogleFonts.notoSansBengali()),
                                ],
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.close),
                              onPressed: () => provider.clearError(),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }
                if (provider.result != null) {
                  return _buildResult(provider.result!);
                }
                return const SizedBox.shrink();
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResult(dynamic result) {
    final severityColors = {'low': Colors.green, 'medium': Colors.orange, 'high': Colors.red, 'critical': Colors.red[900]};
    final severity = result.severity ?? 'low';
    final confidence = result.confidence ?? 0.0;
    final diseaseName = result.diseaseNameBn ?? result.diseaseNameEn ?? 'অজানা রোগ';

    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.bug_report, color: severityColors[severity], size: 32),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(diseaseName, style: GoogleFonts.notoSansBengali(fontSize: 18, fontWeight: FontWeight.bold)),
                        Text('আত্মবিশ্বাস: ${(confidence * 100).toStringAsFixed(0)}%', style: GoogleFonts.notoSansBengali()),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: (severityColors[severity] ?? Colors.grey)!.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      severity == 'high' ? 'গুরুতর' : severity == 'medium' ? 'মাঝারি' : 'সামান্য',
                      style: TextStyle(color: severityColors[severity], fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
