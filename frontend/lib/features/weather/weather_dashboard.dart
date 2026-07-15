/// Weather Dashboard Screen - Complete Material 3 UI
/// Shows current weather, hourly/weekly forecast, alerts, recommendations
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:geolocator/geolocator.dart';
import '../../services/weather_service.dart';

class WeatherDashboard extends StatefulWidget {
  const WeatherDashboard({super.key});

  @override
  State<WeatherDashboard> createState() => _WeatherDashboardState();
}

class _WeatherDashboardState extends State<WeatherDashboard> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  Position? _currentPosition;
  Map<String, dynamic>? _currentWeather;
  List<Map<String, dynamic>>? _hourlyForecast;
  List<Map<String, dynamic>>? _weeklyForecast;
  Map<String, dynamic>? _alerts;
  Map<String, dynamic>? _recommendations;
  bool _isLoading = true;
  String? _error;
  bool _isEnglish = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _initializeLocation();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _initializeLocation() async {
    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          // Use Dhaka as default
          await _loadWeatherData(23.8103, 90.4125);
          return;
        }
      }
      if (permission == LocationPermission.deniedForever) {
        await _loadWeatherData(23.8103, 90.4125);
        return;
      }

      final position = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      setState(() => _currentPosition = position);
      await _loadWeatherData(position.latitude, position.longitude);
    } catch (e) {
      // Fallback to Dhaka
      await _loadWeatherData(23.8103, 90.4125);
    }
  }

  Future<void> _loadWeatherData(double lat, double lon) async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final results = await Future.wait([
        WeatherService.getCurrentWeather(lat, lon),
        WeatherService.getHourlyForecast(lat, lon),
        WeatherService.getWeeklyForecast(lat, lon),
        WeatherService.getWeatherAlerts(lat, lon),
        WeatherService.getFarmingRecommendations(lat, lon),
      ]);

      setState(() {
        _currentWeather = results[0] as Map<String, dynamic>;
        _hourlyForecast = _parseHourlyForecast(results[1] as Map<String, dynamic>);
        _weeklyForecast = _parseWeeklyForecast(results[2] as Map<String, dynamic>);
        _alerts = results[3] as Map<String, dynamic>;
        _recommendations = results[4] as Map<String, dynamic>;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  List<Map<String, dynamic>> _parseHourlyForecast(Map<String, dynamic> data) {
    return List<Map<String, dynamic>>.from(data['forecasts'] ?? []);
  }

  List<Map<String, dynamic>> _parseWeeklyForecast(Map<String, dynamic> data) {
    return List<Map<String, dynamic>>.from(data['forecasts'] ?? []);
  }

  void _toggleLanguage() {
    setState(() => _isEnglish = !_isEnglish);
  }

  String _getText(String en, String bn) => _isEnglish ? en : bn;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      body: _isLoading
          ? _buildLoadingState()
          : _error != null
              ? _buildErrorState()
              : _buildWeatherContent(theme),
    );
  }

  Widget _buildLoadingState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 16),
          Text(
            _getText('Loading weather data...', 'আবহাওয়ার তথ্য লোড হচ্ছে...'),
            style: GoogleFonts.notoSansBengali(fontSize: 16),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              _getText('Unable to load weather data', 'আবহাওয়ার তথ্য লোড করতে ব্যর্থ'),
              style: GoogleFonts.notoSansBengali(fontSize: 18, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              _getText('Please check your internet connection', 'অনুগ্রহ করে আপনার ইন্টারনেট সংযোগ পরীক্ষা করুন'),
              style: GoogleFonts.notoSansBengali(color: Colors.grey[600]),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _initializeLocation,
              icon: const Icon(Icons.refresh),
              label: Text(_getText('Try Again', 'আবার চেষ্টা করুন'), style: GoogleFonts.notoSansBengali()),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWeatherContent(ThemeData theme) {
    final weather = _currentWeather!;
    return CustomScrollView(
      slivers: [
        // App Bar with current weather
        SliverAppBar(
          expandedHeight: 320,
          pinned: true,
          backgroundColor: _getWeatherColor(weather['weather_code'] ?? 0),
          flexibleSpace: FlexibleSpaceBar(
            background: _buildCurrentWeatherHeader(weather, theme),
          ),
          actions: [
            // Language toggle
            IconButton(
              onPressed: _toggleLanguage,
              icon: Text(
                _isEnglish ? 'বাং' : 'EN',
                style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold, color: Colors.white),
              ),
            ),
            // Refresh
            IconButton(
              onPressed: () => _initializeLocation(),
              icon: const Icon(Icons.refresh, color: Colors.white),
            ),
          ],
          bottom: TabBar(
            controller: _tabController,
            indicatorColor: Colors.white,
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white70,
            tabs: [
              Tab(text: _getText('Today', 'আজ')),
              Tab(text: _getText('Hourly', 'ঘণ্টার')),
              Tab(text: _getText('Weekly', 'সাপ্তাহিক')),
              Tab(text: _getText('Farm', 'কৃষি')),
            ],
          ),
        ),

        // Tab content
        SliverFillRemaining(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildTodayTab(weather, theme),
              _buildHourlyTab(theme),
              _buildWeeklyTab(theme),
              _buildFarmTab(theme),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCurrentWeatherHeader(Map<String, dynamic> weather, ThemeData theme) {
    final code = weather['weather_code'] ?? 0;
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            _getWeatherColor(code),
            _getWeatherColor(code).withOpacity(0.8),
          ],
        ),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 60),
          child: Column(
            children: [
              // Location and time
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _isEnglish ? weather['location'] ?? '' : weather['location_bn'] ?? '',
                        style: GoogleFonts.notoSansBengali(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        weather['last_updated'] ?? '',
                        style: GoogleFonts.notoSansBengali(
                          color: Colors.white70,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.location_on, size: 14, color: Colors.white),
                        const SizedBox(width: 4),
                        Text(
                          _getText('Current Location', 'বর্তমান অবস্থান'),
                          style: GoogleFonts.notoSansBengali(color: Colors.white, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const Spacer(),
              // Main temperature display
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    weather['icon'] ?? '☀️',
                    style: const TextStyle(fontSize: 56),
                  ),
                  const SizedBox(width: 16),
                  Text(
                    '${(weather['temperature'] as num?)?.toStringAsFixed(0) ?? '--'}°',
                    style: GoogleFonts.notoSansBengali(
                      color: Colors.white,
                      fontSize: 72,
                      fontWeight: FontWeight.bold,
                      height: 1,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'C',
                    style: GoogleFonts.notoSansBengali(
                      color: Colors.white70,
                      fontSize: 24,
                      fontWeight: FontWeight.w300,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _isEnglish ? weather['condition'] ?? '' : weather['condition_bn'] ?? '',
                style: GoogleFonts.notoSansBengali(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w500,
                ),
              ),
              Text(
                '${_getText("Feels like", "অনুভূমিক")} ${(weather['feels_like'] as num?)?.toStringAsFixed(0) ?? '--'}°',
                style: GoogleFonts.notoSansBengali(
                  color: Colors.white70,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 12),
              // Quick stats row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _quickStat(
                    Icons.water_drop_outlined,
                    _getText('Humidity', 'আর্দ্তা'),
                    '${weather['humidity'] ?? '--'}%',
                  ),
                  _quickStat(
                    Icons.air,
                    _getText('Wind', 'বাতাস'),
                    '${(weather['wind_speed'] as num?)?.toStringAsFixed(0) ?? '--'} km/h',
                  ),
                  _quickStat(
                    Icons.grain,
                    _getText('Rain', 'বৃষ্টি'),
                    '${(weather['precipitation'] as num?)?.toStringAsFixed(1) ?? '--'} mm',
                  ),
                  _quickStat(
                    Icons.sunny,
                    _getText('UV', 'UV'),
                    '${(weather['uv_index'] as num?)?.toStringAsFixed(0) ?? '--'}',
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _quickStat(IconData icon, String label, String value) {
    return Column(
      children: [
        Icon(icon, color: Colors.white70, size: 20),
        const SizedBox(height: 4),
        Text(
          value,
          style: GoogleFonts.notoSansBengali(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 14,
          ),
        ),
        Text(
          label,
          style: GoogleFonts.notoSansBengali(
            color: Colors.white70,
            fontSize: 11,
          ),
        ),
      ],
    );
  }

  Widget _buildTodayTab(Map<String, dynamic> weather, ThemeData theme) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Detail cards
          _buildDetailSection(weather, theme),
          const SizedBox(height: 16),
          // Sun times
          _buildSunTimesCard(weather, theme),
          const SizedBox(height: 16),
          // Weather alerts
          if (_alerts != null) _buildAlertsSection(theme),
        ],
      ),
    );
  }

  Widget _buildDetailSection(Map<String, dynamic> weather, ThemeData theme) {
    return Card(
      elevation: 0,
      color: theme.colorScheme.surfaceContainerHighest.withOpacity(0.5),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _getText('Weather Details', 'আবহাওয়ার বিস্তারিত'),
              style: GoogleFonts.notoSansBengali(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            _detailRow(
              Icons.thermostat,
              _getText('Temperature', 'তাপমাত্রা'),
              '${(weather['temperature'] as num?)?.toStringAsFixed(1) ?? '--'}°C',
            ),
            _detailRow(
              Icons.thermostat_outlined,
              _getText('Feels Like', 'অনুভূমিক'),
              '${(weather['feels_like'] as num?)?.toStringAsFixed(1) ?? '--'}°C',
            ),
            _detailRow(
              Icons.water_drop_outlined,
              _getText('Humidity', 'আর্দ্তা'),
              '${weather['humidity'] ?? '--'}%',
            ),
            _detailRow(
              Icons.air,
              _getText('Wind Speed', 'বাতাসের গতি'),
              '${(weather['wind_speed'] as num?)?.toStringAsFixed(1) ?? '--'} km/h',
            ),
            _detailRow(
              Icons.explore_outlined,
              _getText('Wind Direction', 'বাতাসের দিক'),
              _isEnglish ? (weather['wind_direction'] ?? '--') : (weather['wind_direction_bn'] ?? '--'),
            ),
            _detailRow(
              Icons.speed,
              _getText('Pressure', 'চাপ'),
              '${(weather['pressure'] as num?)?.toStringAsFixed(0) ?? '--'} hPa',
            ),
            _detailRow(
              Icons.sunny,
              _getText('UV Index', 'UV সূচক'),
              '${(weather['uv_index'] as num?)?.toStringAsFixed(0) ?? '--'} (${_getText(weather['uv_level'] ?? '--', _getUvLevelBn(weather['uv_level'] ?? ''))})',
            ),
          ],
        ),
      ),
    );
  }

  String _getUvLevelBn(String level) {
    const levels = {
      'low': 'কম', 'moderate': 'মাঝারি', 'high': 'বেশি',
      'very_high': 'খুব বেশি', 'extreme': 'চরম',
    };
    return levels[level] ?? 'অজানা';
  }

  Widget _detailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.grey[600]),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.notoSansBengali(color: Colors.grey[600]),
            ),
          ),
          Text(
            value,
            style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  Widget _buildSunTimesCard(Map<String, dynamic> weather, ThemeData theme) {
    return Card(
      elevation: 0,
      color: theme.colorScheme.surfaceContainerHighest.withOpacity(0.5),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            Column(
              children: [
                const Icon(Icons.wb_sunny, color: Colors.orange, size: 32),
                const SizedBox(height: 8),
                Text(
                  weather['sunrise'] ?? '--:--',
                  style: GoogleFonts.notoSansBengali(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                Text(
                  _getText('Sunrise', 'সূর্যোদয়'),
                  style: GoogleFonts.notoSansBengali(color: Colors.grey[600]),
                ),
              ],
            ),
            Container(
              width: 1,
              height: 60,
              color: Colors.grey[300],
            ),
            Column(
              children: [
                const Icon(Icons.nights_stay, color: Colors.indigo, size: 32),
                const SizedBox(height: 8),
                Text(
                  weather['sunset'] ?? '--:--',
                  style: GoogleFonts.notoSansBengali(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                Text(
                  _getText('Sunset', 'সূর্যাস্ত'),
                  style: GoogleFonts.notoSansBengali(color: Colors.grey[600]),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAlertsSection(ThemeData theme) {
    final alerts = List<Map<String, dynamic>>.from(_alerts!['alerts'] ?? []);
    if (alerts.isEmpty) {
      return Card(
        elevation: 0,
        color: Colors.green.withOpacity(0.1),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              const Icon(Icons.check_circle, color: Colors.green, size: 32),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _getText('No Weather Alerts', 'কোনো আবহাওয়া সতর্কতা নেই'),
                      style: GoogleFonts.notoSansBengali(
                        fontWeight: FontWeight.bold,
                        color: Colors.green[800],
                      ),
                    ),
                    Text(
                      _getText('Weather conditions are safe for farming', 'কৃষির জন্য আবহাওয়ার পরিস্থিতি নিরাপদ'),
                      style: GoogleFonts.notoSansBengali(
                        color: Colors.green[700],
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _getText('Weather Alerts', 'আবহাওয়া সতর্কতা'),
          style: GoogleFonts.notoSansBengali(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        ...alerts.map((alert) => Card(
          elevation: 0,
          color: _getAlertColor(alert['severity']).withOpacity(0.1),
          margin: const EdgeInsets.only(bottom: 8),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Icon(
                  _getAlertIcon(alert['severity']),
                  color: _getAlertColor(alert['severity']),
                  size: 32,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _isEnglish ? (alert['title'] ?? '') : (alert['title_bn'] ?? ''),
                        style: GoogleFonts.notoSansBengali(
                          fontWeight: FontWeight.bold,
                          color: _getAlertColor(alert['severity']),
                        ),
                      ),
                      Text(
                        _isEnglish ? (alert['description'] ?? '') : (alert['description_bn'] ?? ''),
                        style: GoogleFonts.notoSansBengali(fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        )),
      ],
    );
  }

  Widget _buildHourlyTab(ThemeData theme) {
    if (_hourlyForecast == null || _hourlyForecast!.isEmpty) {
      return Center(
        child: Text(_getText('No hourly data available', 'ঘণ্টার তথ্য পাওয়া যায়নি'),
          style: GoogleFonts.notoSansBengali()),
      );
    }

    return Column(
      children: [
        // Hourly horizontal scroll
        SizedBox(
          height: 180,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            itemCount: _hourlyForecast!.length,
            itemBuilder: (context, index) {
              final hour = _hourlyForecast![index];
              return _buildHourlyCard(hour, theme);
            },
          ),
        ),
        // Hourly details list
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: _hourlyForecast!.length,
            itemBuilder: (context, index) {
              final hour = _hourlyForecast![index];
              return _buildHourlyDetailRow(hour, theme);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildHourlyCard(Map<String, dynamic> hour, ThemeData theme) {
    final time = _formatHourlyTime(hour['time'] ?? '');
    return Card(
      margin: const EdgeInsets.only(right: 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              time,
              style: GoogleFonts.notoSansBengali(
                fontSize: 12,
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 4),
            Text(
              hour['icon'] ?? '☀️',
              style: const TextStyle(fontSize: 28),
            ),
            const SizedBox(height: 4),
            Text(
              '${(hour['temperature'] as num?)?.toStringAsFixed(0) ?? '--'}°',
              style: GoogleFonts.notoSansBengali(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            if ((hour['precipitation_probability'] ?? 0) > 0)
              Text(
                '💧${hour['precipitation_probability']}%',
                style: GoogleFonts.notoSansBengali(
                  fontSize: 10,
                  color: Colors.blue,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildHourlyDetailRow(Map<String, dynamic> hour, ThemeData theme) {
    final time = _formatHourlyTime(hour['time'] ?? '');
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Text(hour['icon'] ?? '☀️', style: const TextStyle(fontSize: 28)),
        title: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              time,
              style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold),
            ),
            Text(
              '${(hour['temperature'] as num?)?.toStringAsFixed(0) ?? '--'}°C',
              style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold),
            ),
          ],
        ),
        subtitle: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              _isEnglish ? (hour['condition'] ?? '') : (hour['condition_bn'] ?? ''),
              style: GoogleFonts.notoSansBengali(fontSize: 12, color: Colors.grey[600]),
            ),
            Row(
              children: [
                Icon(Icons.water_drop, size: 12, color: Colors.blue),
                Text(' ${hour['humidity'] ?? '--'}%', style: GoogleFonts.notoSansBengali(fontSize: 12)),
                const SizedBox(width: 8),
                Icon(Icons.air, size: 12, color: Colors.grey),
                Text(' ${(hour['wind_speed'] as num?)?.toStringAsFixed(0) ?? '--'} km/h', style: GoogleFonts.notoSansBengali(fontSize: 12)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWeeklyTab(ThemeData theme) {
    if (_weeklyForecast == null || _weeklyForecast!.isEmpty) {
      return Center(
        child: Text(_getText('No weekly data available', 'সাপ্তাহিক তথ্য পাওয়া যায়নি'),
          style: GoogleFonts.notoSansBengali()),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _weeklyForecast!.length,
      itemBuilder: (context, index) {
        final day = _weeklyForecast![index];
        return _buildWeeklyDayCard(day, theme, index == 0);
      },
    );
  }

  Widget _buildWeeklyDayCard(Map<String, dynamic> day, ThemeData theme, bool isToday) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: isToday ? theme.colorScheme.primaryContainer.withOpacity(0.3) : null,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  flex: 2,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isToday
                            ? _getText('Today', 'আজ')
                            : (_isEnglish ? (day['day_name'] ?? '') : (day['day_name_bn'] ?? '')),
                        style: GoogleFonts.notoSansBengali(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        _isEnglish ? (day['condition'] ?? '') : (day['condition_bn'] ?? ''),
                        style: GoogleFonts.notoSansBengali(
                          color: Colors.grey[600],
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  day['icon'] ?? '☀️',
                  style: const TextStyle(fontSize: 32),
                ),
                const SizedBox(width: 16),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '${(day['temp_max'] as num?)?.toStringAsFixed(0) ?? '--'}° / ${(day['temp_min'] as num?)?.toStringAsFixed(0) ?? '--'}°',
                      style: GoogleFonts.notoSansBengali(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    if ((day['precipitation_probability'] ?? 0) > 0)
                      Text(
                        '💧${day['precipitation_probability']}%',
                        style: GoogleFonts.notoSansBengali(
                          fontSize: 12,
                          color: Colors.blue,
                        ),
                      ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _weeklyStat(
                  Icons.water_drop,
                  _getText('Rain', 'বৃষ্টি'),
                  '${(day['precipitation_sum'] as num?)?.toStringAsFixed(1) ?? '0'} mm',
                ),
                _weeklyStat(
                  Icons.air,
                  _getText('Wind', 'বাতাস'),
                  '${(day['wind_speed_max'] as num?)?.toStringAsFixed(0) ?? '--'} km/h',
                ),
                _weeklyStat(
                  Icons.sunny,
                  _getText('UV', 'UV'),
                  '${(day['uv_index_max'] as num?)?.toStringAsFixed(0) ?? '--'}',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _weeklyStat(IconData icon, String label, String value) {
    return Column(
      children: [
        Icon(icon, size: 16, color: Colors.grey[600]),
        const SizedBox(height: 2),
        Text(
          value,
          style: GoogleFonts.notoSansBengali(fontSize: 12, fontWeight: FontWeight.w600),
        ),
        Text(
          label,
          style: GoogleFonts.notoSansBengali(fontSize: 10, color: Colors.grey[600]),
        ),
      ],
    );
  }

  Widget _buildFarmTab(ThemeData theme) {
    if (_recommendations == null) {
      return Center(
        child: Text(_getText('Loading farming recommendations...', 'কৃষি সুপারিশ লোড হচ্ছে...'),
          style: GoogleFonts.notoSansBengali()),
      );
    }

    final recommendations = List<Map<String, dynamic>>.from(_recommendations!['recommendations'] ?? []);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Weather summary for farming
          _buildFarmWeatherSummary(theme),
          const SizedBox(height: 16),
          // Recommendations
          Text(
            _getText('Farming Recommendations', 'কৃষি সুপারিশ'),
            style: GoogleFonts.notoSansBengali(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          if (recommendations.isEmpty)
            Card(
              elevation: 0,
              color: theme.colorScheme.surfaceContainerHighest.withOpacity(0.5),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: Text(
                    _getText(
                      'No specific recommendations for current weather',
                      'বর্তমান আবহাওয়ার জন্য কোনো নির্দিষ্ট সুপারিশ নেই',
                    ),
                    style: GoogleFonts.notoSansBengali(color: Colors.grey[600]),
                  ),
                ),
              ),
            )
          else
            ...recommendations.map((rec) => _buildRecommendationCard(rec, theme)),
        ],
      ),
    );
  }

  Widget _buildFarmWeatherSummary(ThemeData theme) {
    final weather = _currentWeather!;
    return Card(
      elevation: 0,
      color: Colors.green.withOpacity(0.1),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.agriculture, color: Colors.green, size: 24),
                const SizedBox(width: 8),
                Text(
                  _getText('Weather Farming Conditions', 'আবহাওয়া ও কৃষি পরিস্থিতি'),
                  style: GoogleFonts.notoSansBengali(
                    fontWeight: FontWeight.bold,
                    color: Colors.green[800],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _farmStat(
                  Icons.thermostat,
                  _getText('Temperature', 'তাপমাত্রা'),
                  '${(weather['temperature'] as num?)?.toStringAsFixed(0) ?? '--'}°C',
                  _getTemperatureStatus(weather['temperature'] as num? ?? 0),
                ),
                _farmStat(
                  Icons.water_drop,
                  _getText('Humidity', 'আর্দ্তা'),
                  '${weather['humidity'] ?? '--'}%',
                  _getHumidityStatus(weather['humidity'] as num? ?? 0),
                ),
                _farmStat(
                  Icons.grain,
                  _getText('Rainfall', 'বৃষ্টিপাত'),
                  '${(weather['precipitation'] as num?)?.toStringAsFixed(1) ?? '--'} mm',
                  _getRainfallStatus(weather['precipitation'] as num? ?? 0),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _farmStat(IconData icon, String label, String value, String status) {
    return Column(
      children: [
        Icon(icon, size: 24, color: Colors.green),
        const SizedBox(height: 4),
        Text(
          value,
          style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold),
        ),
        Text(
          label,
          style: GoogleFonts.notoSansBengali(fontSize: 11, color: Colors.grey[600]),
        ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: _getStatusColor(status).withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            status,
            style: GoogleFonts.notoSansBengali(
              fontSize: 10,
              color: _getStatusColor(status),
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildRecommendationCard(Map<String, dynamic> rec, ThemeData theme) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      elevation: 0,
      color: theme.colorScheme.surfaceContainerHighest.withOpacity(0.5),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: _getRecommendationColor(rec['priority']).withOpacity(0.1),
          child: Icon(
            _getRecommendationIcon(rec['category']),
            color: _getRecommendationColor(rec['priority']),
          ),
        ),
        title: Text(
          _isEnglish ? (rec['title'] ?? '') : (rec['title_bn'] ?? ''),
          style: GoogleFonts.notoSansBengali(fontWeight: FontWeight.bold),
        ),
        subtitle: Text(
          _isEnglish ? (rec['description'] ?? '') : (rec['description_bn'] ?? ''),
          style: GoogleFonts.notoSansBengali(fontSize: 12, color: Colors.grey[600]),
        ),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: _getRecommendationColor(rec['priority']).withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            _isEnglish ? (rec['priority'] ?? 'info') : (rec['priority_bn'] ?? 'তথ্য'),
            style: GoogleFonts.notoSansBengali(
              fontSize: 10,
              color: _getRecommendationColor(rec['priority']),
            ),
          ),
        ),
      ),
    );
  }

  // Helper methods
  String _formatHourlyTime(String time) {
    try {
      final dt = DateTime.parse(time);
      final hour = dt.hour;
      if (hour == 0) return '12 AM';
      if (hour < 12) return '$hour AM';
      if (hour == 12) return '12 PM';
      return '${hour - 12} PM';
    } catch (e) {
      return '--';
    }
  }

  Color _getWeatherColor(int code) {
    if (code == 0) return Colors.blue[700]!;
    if (code <= 3) return Colors.blue[500]!;
    if (code <= 48) return Colors.grey[600]!;
    if (code <= 67) return Colors.blue[800]!;
    if (code <= 82) return Colors.blue[900]!;
    if (code >= 95) return Colors.deepPurple[800]!;
    return Colors.blue[600]!;
  }

  Color _getAlertColor(String? severity) {
    switch (severity) {
      case 'severe': return Colors.red;
      case 'moderate': return Colors.orange;
      case 'minor': return Colors.yellow[700]!;
      default: return Colors.blue;
    }
  }

  IconData _getAlertIcon(String? severity) {
    switch (severity) {
      case 'severe': return Icons.warning;
      case 'moderate': return Icons.info;
      case 'minor': return Icons.info_outline;
      default: return Icons.notification_important;
    }
  }

  String _getTemperatureStatus(num temp) {
    if (temp < 10) return _getText('Cold', 'ঠান্ডা');
    if (temp < 20) return _getText('Cool', 'শীতল');
    if (temp < 30) return _getText('Warm', 'উষ্ণ');
    if (temp < 35) return _getText('Hot', 'গরম');
    return _getText('Very Hot', 'খুব গরম');
  }

  String _getHumidityStatus(num humidity) {
    if (humidity < 30) return _getText('Dry', 'শুষ্ক');
    if (humidity < 60) return _getText('Normal', 'স্বাভাবিক');
    if (humidity < 80) return _getText('Humid', 'আর্দ্র');
    return _getText('Very Humid', 'খুব আর্দ্র');
  }

  String _getRainfallStatus(num rain) {
    if (rain == 0) return _getText('None', 'নেই');
    if (rain < 2.5) return _getText('Light', 'হালকা');
    if (rain < 7.5) return _getText('Moderate', 'মাঝারি');
    if (rain < 50) return _getText('Heavy', 'ভারী');
    return _getText('Very Heavy', 'খুব ভারী');
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Cold': case 'Cool': case 'Dry': case 'None': case 'Light':
        return Colors.blue;
      case 'Normal': case 'Warm': case 'Moderate':
        return Colors.green;
      case 'Hot': case 'Humid': case 'Heavy':
        return Colors.orange;
      case 'Very Hot': case 'Very Humid': case 'Very Heavy':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  Color _getRecommendationColor(String? priority) {
    switch (priority) {
      case 'high': case 'urgent': return Colors.red;
      case 'medium': return Colors.orange;
      case 'low': return Colors.blue;
      default: return Colors.green;
    }
  }

  IconData _getRecommendationIcon(String? category) {
    switch (category) {
      case 'irrigation': return Icons.water;
      case 'pest': return Icons.bug_report;
      case 'planting': return Icons.eco;
      case 'harvest': return Icons.agriculture;
      case 'fertilizer': return Icons.science;
      default: return Icons.lightbulb;
    }
  }
}
