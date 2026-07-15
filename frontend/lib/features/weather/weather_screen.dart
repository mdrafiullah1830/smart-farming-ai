import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/theme/app_theme.dart';
import '../../providers/providers.dart';

class WeatherScreen extends StatefulWidget {
  const WeatherScreen({super.key});

  @override
  State<WeatherScreen> createState() => _WeatherScreenState();
}

class _WeatherScreenState extends State<WeatherScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => context.read<WeatherProvider>().loadWeather('demo-district-id'));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('আবহাওয়া তথ্য', style: GoogleFonts.notoSansBengali()),
      ),
      body: Consumer<WeatherProvider>(
        builder: (context, weather, _) {
          if (weather.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          final current = weather.currentWeather;
          if (current == null) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.wb_sunny, size: 64, color: Colors.orange),
                  const SizedBox(height: 16),
                  Text('আবহাওয়ার তথ্য লোড হচ্ছে...', style: GoogleFonts.notoSansBengali()),
                ],
              ),
            );
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildCurrentWeather(current),
                const SizedBox(height: 24),
                _buildWeatherDetails(current),
                const SizedBox(height: 24),
                _buildForecastSection(weather.forecast),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildCurrentWeather(dynamic weather) {
    return Card(
      color: AppTheme.primaryColor,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Text(
              weather.districtBn,
              style: GoogleFonts.notoSansBengali(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.wb_sunny, color: Colors.yellow[300], size: 64),
                const SizedBox(width: 16),
                Text(
                  '${weather.temperature.toStringAsFixed(1)}°C',
                  style: GoogleFonts.notoSansBengali(
                    color: Colors.white,
                    fontSize: 48,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              weather.conditionBn,
              style: GoogleFonts.notoSansBengali(
                color: Colors.white70,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _weatherStat('আর্দ্তা', '${weather.humidity.toStringAsFixed(0)}%', Icons.water_drop),
                _weatherStat('বাতাস', '${weather.windSpeed.toStringAsFixed(1)} km/h', Icons.air),
                _weatherStat('বৃষ্টি', '${weather.rainfall.toStringAsFixed(1)} mm', Icons.grain),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _weatherStat(String label, String value, IconData icon) {
    return Column(
      children: [
        Icon(icon, color: Colors.white70, size: 20),
        const SizedBox(height: 4),
        Text(value, style: GoogleFonts.notoSansBengali(color: Colors.white, fontWeight: FontWeight.bold)),
        Text(label, style: GoogleFonts.notoSansBengali(color: Colors.white70, fontSize: 12)),
      ],
    );
  }

  Widget _buildWeatherDetails(dynamic weather) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('বিস্তারিত তথ্য', style: GoogleFonts.notoSansBengali(fontSize: 18, fontWeight: FontWeight.bold)),
            const Divider(),
            _detailRow('অনুভূমিক তাপমাত্রা', '${weather.feelsLike.toStringAsFixed(1)}°C'),
            _detailRow('চাপ', '${weather.pressure.toStringAsFixed(0)} hPa'),
            _detailRow('মেঘ আচ্ছাদন', '${weather.cloudCover.toStringAsFixed(0)}%'),
            _detailRow('দৃশ্যমানতা', '${weather.visibility.toStringAsFixed(1)} km'),
            _detailRow('সূর্যোদয়', weather.sunrise),
            _detailRow('সূর্যাস্ত', weather.sunset),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: GoogleFonts.notoSansBengali(color: AppTheme.textSecondary)),
          Text(value, style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _buildForecastSection(List forecast) {
    if (forecast.isEmpty) return const SizedBox();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('৭ দিনের পূর্বাভাস', style: GoogleFonts.notoSansBengali(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        SizedBox(
          height: 120,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: forecast.length.clamp(0, 7),
            itemBuilder: (context, index) {
              final f = forecast[index];
              return Card(
                margin: const EdgeInsets.only(right: 8),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        f.forecastDate?.split(' ')[0].split('-').last ?? '',
                        style: GoogleFonts.notoSansBengali(fontSize: 12),
                      ),
                      const SizedBox(height: 8),
                      const Icon(Icons.wb_cloudy, color: Colors.blue),
                      const SizedBox(height: 8),
                      Text(
                        '${f.temperature.toStringAsFixed(0)}°C',
                        style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
