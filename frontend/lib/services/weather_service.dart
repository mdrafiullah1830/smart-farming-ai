/// Weather API Service - Handles all weather-related API calls
/// Uses Open-Meteo API (free, no key required)
import 'dart:convert';
import 'package:http/http.dart' as http;

class WeatherService {
  static const String _baseUrl = 'http://localhost:8000/api/v1/weather';

  /// Get current weather for coordinates
  static Future<Map<String, dynamic>> getCurrentWeather(double lat, double lon) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/current?lat=$lat&lon=$lon'),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
      throw Exception('Failed to load weather data');
    } catch (e) {
      // Fallback to direct Open-Meteo API
      return _fetchDirectFromOpenMeteo(lat, lon);
    }
  }

  /// Direct Open-Meteo API fallback
  static Future<Map<String, dynamic>> _fetchDirectFromOpenMeteo(double lat, double lon) async {
    final url = Uri.parse(
      'https://api.open-meteo.com/v1/forecast'
      '?latitude=$lat&longitude=$lon'
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,uv_index'
      '&daily=sunrise,sunset'
      '&timezone=Asia/Dhaka&forecast_days=1',
    );

    final response = await http.get(url).timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return _formatCurrentWeather(data, lat, lon);
    }
    throw Exception('Weather service unavailable');
  }

  static Map<String, dynamic> _formatCurrentWeather(Map<String, dynamic> data, double lat, double lon) {
    final current = data['current'] ?? {};
    final daily = data['daily'] ?? {};
    final code = current['weather_code'] ?? 0;

    return {
      'location': _getLocationName(lat, lon),
      'location_bn': _getLocationNameBn(lat, lon),
      'latitude': lat,
      'longitude': lon,
      'temperature': current['temperature_2m'] ?? 0,
      'feels_like': current['apparent_temperature'] ?? 0,
      'humidity': current['relative_humidity_2m'] ?? 0,
      'precipitation': current['precipitation'] ?? 0,
      'weather_code': code,
      'condition': _getCondition(code),
      'condition_bn': _getConditionBn(code),
      'icon': _getWeatherIcon(code),
      'wind_speed': current['wind_speed_10m'] ?? 0,
      'wind_direction': _getWindDirection(current['wind_direction_10m'] ?? 0),
      'wind_direction_bn': _getWindDirectionBn(current['wind_direction_10m'] ?? 0),
      'pressure': current['surface_pressure'] ?? 0,
      'uv_index': current['uv_index'] ?? 0,
      'uv_level': _getUvLevel(current['uv_index'] ?? 0),
      'sunrise': _formatTime(daily['sunrise']?.isNotEmpty == true ? daily['sunrise'][0] : ''),
      'sunset': _formatTime(daily['sunset']?.isNotEmpty == true ? daily['sunset'][0] : ''),
      'last_updated': _formatNow(),
    };
  }

  /// Get hourly forecast
  static Future<Map<String, dynamic>> getHourlyForecast(double lat, double lon, {int hours = 24}) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/hourly?lat=$lat&lon=$lon&hours=$hours'),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
      throw Exception('Failed to load forecast');
    } catch (e) {
      return _fetchDirectHourly(lat, lon, hours);
    }
  }

  static Future<Map<String, dynamic>> _fetchDirectHourly(double lat, double lon, int hours) async {
    final url = Uri.parse(
      'https://api.open-meteo.com/v1/forecast'
      '?latitude=$lat&longitude=$lon'
      '&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m'
      '&timezone=Asia/Dhaka&forecast_hours=$hours',
    );

    final response = await http.get(url).timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return _formatHourlyForecast(data, lat, lon, hours);
    }
    throw Exception('Weather service unavailable');
  }

  static Map<String, dynamic> _formatHourlyForecast(Map<String, dynamic> data, double lat, double lon, int hours) {
    final hourly = data['hourly'] ?? {};
    final times = List<String>.from(hourly['time'] ?? []);
    final temps = List<double>.from((hourly['temperature_2m'] ?? []).map((e) => (e as num).toDouble()));
    final humidities = List<int>.from(hourly['relative_humidity_2m'] ?? []);
    final precipProbs = List<int>.from(hourly['precipitation_probability'] ?? []);
    final precipitations = List<double>.from((hourly['precipitation'] ?? []).map((e) => (e as num).toDouble()));
    final codes = List<int>.from(hourly['weather_code'] ?? []);
    final winds = List<double>.from((hourly['wind_speed_10m'] ?? []).map((e) => (e as num).toDouble()));
    final windDirs = List<double>.from((hourly['wind_direction_10m'] ?? []).map((e) => (e as num).toDouble()));

    final forecasts = <Map<String, dynamic>>[];
    for (var i = 0; i < times.length && i < hours; i++) {
      final code = i < codes.length ? codes[i] : 0;
      forecasts.add({
        'time': times[i],
        'temperature': i < temps.length ? temps[i] : 0.0,
        'humidity': i < humidities.length ? humidities[i] : 0,
        'precipitation_probability': i < precipProbs.length ? precipProbs[i] : 0,
        'precipitation': i < precipitations.length ? precipitations[i] : 0.0,
        'weather_code': code,
        'condition': _getCondition(code),
        'condition_bn': _getConditionBn(code),
        'icon': _getWeatherIcon(code),
        'wind_speed': i < winds.length ? winds[i] : 0.0,
        'wind_direction': _getWindDirection(i < windDirs.length ? windDirs[i] : 0),
      });
    }

    return {
      'location': _getLocationName(lat, lon),
      'location_bn': _getLocationNameBn(lat, lon),
      'latitude': lat,
      'longitude': lon,
      'forecasts': forecasts,
    };
  }

  /// Get weekly forecast
  static Future<Map<String, dynamic>> getWeeklyForecast(double lat, double lon) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/weekly?lat=$lat&lon=$lon'),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
      throw Exception('Failed to load weekly forecast');
    } catch (e) {
      return _fetchDirectWeekly(lat, lon);
    }
  }

  static Future<Map<String, dynamic>> _fetchDirectWeekly(double lat, double lon) async {
    final url = Uri.parse(
      'https://api.open-meteo.com/v1/forecast'
      '?latitude=$lat&longitude=$lon'
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset,uv_index_max'
      '&timezone=Asia/Dhaka&forecast_days=7',
    );

    final response = await http.get(url).timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return _formatWeeklyForecast(data, lat, lon);
    }
    throw Exception('Weather service unavailable');
  }

  static Map<String, dynamic> _formatWeeklyForecast(Map<String, dynamic> data, double lat, double lon) {
    final daily = data['daily'] ?? {};
    final dates = List<String>.from(daily['time'] ?? []);
    final codes = List<int>.from(daily['weather_code'] ?? []);
    final maxTemps = List<double>.from((daily['temperature_2m_max'] ?? []).map((e) => (e as num).toDouble()));
    final minTemps = List<double>.from((daily['temperature_2m_min'] ?? []).map((e) => (e as num).toDouble()));
    final precipSums = List<double>.from((daily['precipitation_sum'] ?? []).map((e) => (e as num).toDouble()));
    final precipProbs = List<int>.from(daily['precipitation_probability_max'] ?? []);
    final windMaxs = List<double>.from((daily['wind_speed_10m_max'] ?? []).map((e) => (e as num).toDouble()));
    final sunrises = List<String>.from(daily['sunrise'] ?? []);
    final sunsets = List<String>.from(daily['sunset'] ?? []);
    final uvMaxs = List<double>.from((daily['uv_index_max'] ?? []).map((e) => (e as num).toDouble()));

    final forecasts = <Map<String, dynamic>>[];
    for (var i = 0; i < dates.length && i < 7; i++) {
      final code = i < codes.length ? codes[i] : 0;
      forecasts.add({
        'date': dates[i],
        'day_name': _getDayName(dates[i]),
        'day_name_bn': _getDayNameBn(dates[i]),
        'weather_code': code,
        'condition': _getCondition(code),
        'condition_bn': _getConditionBn(code),
        'icon': _getWeatherIcon(code),
        'temp_max': i < maxTemps.length ? maxTemps[i] : 0.0,
        'temp_min': i < minTemps.length ? minTemps[i] : 0.0,
        'precipitation_sum': i < precipSums.length ? precipSums[i] : 0.0,
        'precipitation_probability': i < precipProbs.length ? precipProbs[i] : 0,
        'wind_speed_max': i < windMaxs.length ? windMaxs[i] : 0.0,
        'sunrise': i < sunrises.length ? _formatTime(sunrises[i]) : '',
        'sunset': i < sunsets.length ? _formatTime(sunsets[i]) : '',
        'uv_index_max': i < uvMaxs.length ? uvMaxs[i] : 0.0,
      });
    }

    return {
      'location': _getLocationName(lat, lon),
      'location_bn': _getLocationNameBn(lat, lon),
      'latitude': lat,
      'longitude': lon,
      'forecasts': forecasts,
    };
  }

  /// Get weather alerts
  static Future<Map<String, dynamic>> getWeatherAlerts(double lat, double lon) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/alerts?lat=$lat&lon=$lon'),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
      throw Exception('Failed to load alerts');
    } catch (e) {
      return _generateLocalAlerts(lat, lon);
    }
  }

  static Map<String, dynamic> _generateLocalAlerts(double lat, double lon) {
    // Generate alerts based on basic weather data
    return {
      'location': _getLocationName(lat, lon),
      'location_bn': _getLocationNameBn(lat, lon),
      'alerts': <Map<String, dynamic>>[],
      'count': 0,
    };
  }

  /// Get farming recommendations
  static Future<Map<String, dynamic>> getFarmingRecommendations(double lat, double lon) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/recommendations?lat=$lat&lon=$lon'),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
      throw Exception('Failed to load recommendations');
    } catch (e) {
      return {
        'location': _getLocationName(lat, lon),
        'location_bn': _getLocationNameBn(lat, lon),
        'recommendations': <Map<String, dynamic>>[],
        'count': 0,
      };
    }
  }

  /// Search locations
  static Future<List<Map<String, dynamic>>> searchLocations(String query) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/search?name=$query'),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return List<Map<String, dynamic>>.from(data['results'] ?? []);
      }
      throw Exception('Failed to search locations');
    } catch (e) {
      return _searchBdLocations(query);
    }
  }

  static List<Map<String, dynamic>> _searchBdLocations(String query) {
    // Local Bangladesh locations fallback
    final locations = [
      {'name': 'Dhaka', 'name_bn': 'ঢাকা', 'latitude': 23.8103, 'longitude': 90.4125, 'admin1': 'Dhaka'},
      {'name': 'Chittagong', 'name_bn': 'চট্টগ্রাম', 'latitude': 22.3569, 'longitude': 91.7832, 'admin1': 'Chittagong'},
      {'name': 'Rajshahi', 'name_bn': 'রাজশাহী', 'latitude': 24.3740, 'longitude': 88.6011, 'admin1': 'Rajshahi'},
      {'name': 'Khulna', 'name_bn': 'খুলনা', 'latitude': 22.8456, 'longitude': 89.5403, 'admin1': 'Khulna'},
      {'name': 'Sylhet', 'name_bn': 'সিলেট', 'latitude': 24.8949, 'longitude': 91.8687, 'admin1': 'Sylhet'},
      {'name': 'Barisal', 'name_bn': 'বরিশাল', 'latitude': 22.7010, 'longitude': 90.3535, 'admin1': 'Barisal'},
      {'name': 'Rangpur', 'name_bn': 'রংপুর', 'latitude': 25.7439, 'longitude': 89.2752, 'admin1': 'Rangpur'},
      {'name': 'Mymensingh', 'name_bn': 'ময়মনসিংহ', 'latitude': 24.7471, 'longitude': 90.4204, 'admin1': 'Mymensingh'},
    ];

    final q = query.toLowerCase();
    return locations.where((l) =>
      l['name'].toString().toLowerCase().contains(q) ||
      l['name_bn'].toString().contains(query)
    ).toList();
  }

  // Helper methods
  static String _getLocationName(double lat, double lon) {
    final regions = [
      [23.81, 90.41, 'Dhaka'], [22.35, 91.78, 'Chittagong'],
      [24.37, 88.60, 'Rajshahi'], [22.82, 89.54, 'Khulna'],
      [24.90, 91.87, 'Sylhet'], [22.70, 90.35, 'Barisal'],
      [25.75, 89.24, 'Rangpur'], [24.75, 90.40, 'Mymensingh'],
    ];
    double minDist = double.infinity;
    String name = 'Bangladesh';
    for (final r in regions) {
      final dist = ((lat - (r[0] as num)) * (lat - (r[0] as num)) + (lon - (r[1] as num)) * (lon - (r[1] as num)));
      if (dist < minDist) { minDist = dist.toDouble(); name = r[2] as String; }
    }
    return name;
  }

  static String _getLocationNameBn(double lat, double lon) {
    final regions = [
      [23.81, 90.41, 'ঢাকা'], [22.35, 91.78, 'চট্টগ্রাম'],
      [24.37, 88.60, 'রাজশাহী'], [22.82, 89.54, 'খুলনা'],
      [24.90, 91.87, 'সিলেট'], [22.70, 90.35, 'বরিশাল'],
      [25.75, 89.24, 'রংপুর'], [24.75, 90.40, 'ময়মনসিংহ'],
    ];
    double minDist = double.infinity;
    String name = 'বাংলাদেশ';
    for (final r in regions) {
      final dist = ((lat - (r[0] as num)) * (lat - (r[0] as num)) + (lon - (r[1] as num)) * (lon - (r[1] as num)));
      if (dist < minDist) { minDist = dist.toDouble(); name = r[2] as String; }
    }
    return name;
  }

  static String _getCondition(int code) {
    const conditions = {
      0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Rime Fog', 51: 'Light Drizzle', 53: 'Moderate Drizzle',
      55: 'Dense Drizzle', 61: 'Light Rain', 63: 'Moderate Rain', 65: 'Heavy Rain',
      71: 'Light Snow', 73: 'Moderate Snow', 75: 'Heavy Snow',
      80: 'Light Rain Showers', 81: 'Moderate Rain Showers', 82: 'Violent Rain Showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with Hail', 99: 'Heavy Thunderstorm',
    };
    return conditions[code] ?? 'Unknown';
  }

  static String _getConditionBn(int code) {
    const conditions = {
      0: 'পরিষ্কার', 1: 'মূলত পরিষ্কার', 2: 'আংশিক মেঘলা', 3: 'মেঘাচ্ছন্ন',
      45: 'কুয়াশা', 48: 'ঘন কুয়াশা', 51: 'হালকা গুঁড়ি বৃষ্টি', 53: 'মাঝারি গুঁড়ি বৃষ্টি',
      55: 'ঘন গুঁড়ি বৃষ্টি', 61: 'হালকা বৃষ্টি', 63: 'মাঝারি বৃষ্টি', 65: 'ভারী বৃষ্টি',
      71: 'হালকা তুষারপাত', 73: 'মাঝারি তুষারপাত', 75: 'ভারী তুষারপাত',
      80: 'হালকা বৃষ্টির ঝাপটা', 81: 'মাঝারি বৃষ্টির ঝাপটা', 82: 'তীব্র বৃষ্টির ঝাপটা',
      95: 'বজ্রঝড়', 96: 'বজ্রঝড় ও শিলাবৃষ্টি', 99: 'ভারী বজ্রঝড়',
    };
    return conditions[code] ?? 'অজানা';
  }

  static String _getWeatherIcon(int code) {
    if (code == 0) return '☀️';
    if (code <= 2) return '⛅';
    if (code == 3) return '☁️';
    if (code <= 48) return '🌫️';
    if (code <= 55) return '🌦️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌧️';
    if (code <= 86) return '🌨️';
    if (code >= 95) return '⛈️';
    return '🌤️';
  }

  static String _getWindDirection(double deg) {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[(deg / 22.5).round() % 16];
  }

  static String _getWindDirectionBn(double deg) {
    const dirs = ['উত্তর', 'উত্তর-পূর্ব', 'পূর্ব-উত্তর', 'পূর্ব',
                  'পূর্ব', 'পূর্ব-দক্ষিণ', 'দক্ষিণ-পূর্ব', 'দক্ষিণ',
                  'দক্ষিণ', 'দক্ষিণ-পশ্চিম', 'পশ্চিম-দক্ষিণ', 'পশ্চিম',
                  'পশ্চিম', 'পশ্চিম-উত্তর', 'উত্তর-পশ্চিম', 'উত্তর'];
    return dirs[(deg / 22.5).round() % 16];
  }

  static String _getUvLevel(double uv) {
    if (uv <= 2) return 'low';
    if (uv <= 5) return 'moderate';
    if (uv <= 7) return 'high';
    if (uv <= 10) return 'very_high';
    return 'extreme';
  }

  static String _formatTime(String isoTime) {
    if (isoTime.isEmpty) return '';
    try {
      final dt = DateTime.parse(isoTime);
      final hour = dt.hour;
      final min = dt.minute.toString().padLeft(2, '0');
      if (hour == 0) return '12:$min AM';
      if (hour < 12) return '$hour:$min AM';
      if (hour == 12) return '12:$min PM';
      return '${hour - 12}:$min PM';
    } catch (e) {
      return isoTime;
    }
  }

  static String _formatNow() {
    final now = DateTime.now();
    final hour = now.hour;
    final min = now.minute.toString().padLeft(2, '0');
    if (hour == 0) return '12:$min AM';
    if (hour < 12) return '$hour:$min AM';
    if (hour == 12) return '12:$min PM';
    return '${hour - 12}:$min PM';
  }

  static String _getDayName(String dateStr) {
    try {
      final dt = DateTime.parse(dateStr);
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      return days[dt.weekday - 1];
    } catch (e) {
      return 'Unknown';
    }
  }

  static String _getDayNameBn(String dateStr) {
    try {
      final dt = DateTime.parse(dateStr);
      const days = ['সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার', 'রবিবার'];
      return days[dt.weekday - 1];
    } catch (e) {
      return 'অজানা';
    }
  }
}
