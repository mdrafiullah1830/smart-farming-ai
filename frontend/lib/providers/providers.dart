import 'package:flutter/material.dart';
import '../core/network/api_service.dart';
import '../models/models.dart';

class WeatherProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  WeatherData? _currentWeather;
  List<WeatherData> _forecast = [];
  Map<String, dynamic>? _riskData;
  bool _isLoading = false;

  WeatherData? get currentWeather => _currentWeather;
  List<WeatherData> get forecast => _forecast;
  Map<String, dynamic>? get riskData => _riskData;
  bool get isLoading => _isLoading;

  Future<void> loadWeather(String districtId) async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _api.getDistrictWeather(districtId);
      _currentWeather = WeatherData.fromJson(response);
    } catch (e) {
      debugPrint('Weather error: $e');
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<void> loadForecast(String districtId) async {
    try {
      final response = await _api.getWeatherForecast(districtId);
      _forecast = (response['forecasts'] as List)
          .map((f) => WeatherData.fromJson(f))
          .toList();
    } catch (e) {
      debugPrint('Forecast error: $e');
    }
    notifyListeners();
  }

  Future<void> loadRisk(String districtId) async {
    try {
      _riskData = await _api.getWeatherRisk(districtId);
    } catch (e) {
      debugPrint('Risk error: $e');
    }
    notifyListeners();
  }
}

class CropProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  List<CropRecommendation> _recommendations = [];
  List<Map<String, dynamic>> _crops = [];
  bool _isLoading = false;

  List<CropRecommendation> get recommendations => _recommendations;
  List<Map<String, dynamic>> get crops => _crops;
  bool get isLoading => _isLoading;

  Future<void> loadCrops() async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _api.listCrops();
      _crops = List<Map<String, dynamic>>.from(response['crops'] ?? []);
    } catch (e) {
      debugPrint('Crops error: $e');
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<void> recommendCrops(Map<String, dynamic> data) async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _api.recommendCrops(data);
      _recommendations = (response['recommendations'] as List)
          .map((r) => CropRecommendation.fromJson(r))
          .toList();
    } catch (e) {
      debugPrint('Recommend error: $e');
    }
    _isLoading = false;
    notifyListeners();
  }
}

class DiseaseProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  DiseaseDetectionResult? _result;
  bool _isLoading = false;

  DiseaseDetectionResult? get result => _result;
  bool get isLoading => _isLoading;

  Future<void> detectDisease(String imagePath) async {
    _isLoading = true;
    _result = null;
    notifyListeners();
    try {
      final response = await _api.detectDisease(imagePath);
      _result = DiseaseDetectionResult.fromJson(response);
    } catch (e) {
      debugPrint('Disease error: $e');
    }
    _isLoading = false;
    notifyListeners();
  }

  void clearResult() {
    _result = null;
    notifyListeners();
  }
}

class MarketProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  Map<String, dynamic>? _analysis;
  bool _isLoading = false;

  Map<String, dynamic>? get analysis => _analysis;
  bool get isLoading => _isLoading;

  Future<void> loadAnalysis(String districtId) async {
    _isLoading = true;
    notifyListeners();
    try {
      _analysis = await _api.getMarketAnalysis(districtId);
    } catch (e) {
      debugPrint('Market error: $e');
    }
    _isLoading = false;
    notifyListeners();
  }
}

class FarmProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  List<Farm> _farms = [];
  bool _isLoading = false;

  List<Farm> get farms => _farms;
  bool get isLoading => _isLoading;

  Future<void> loadFarms() async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _api.listFarms();
      _farms = (response['farms'] as List)
          .map((f) => Farm.fromJson(f))
          .toList();
    } catch (e) {
      debugPrint('Farms error: $e');
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<bool> createFarm(Map<String, dynamic> data) async {
    _isLoading = true;
    notifyListeners();
    try {
      await _api.createFarm(data);
      await loadFarms();
      return true;
    } catch (e) {
      debugPrint('Create farm error: $e');
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }
}

class NotificationProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  List<AppNotification> _notifications = [];
  int _unreadCount = 0;
  bool _isLoading = false;

  List<AppNotification> get notifications => _notifications;
  int get unreadCount => _unreadCount;
  bool get isLoading => _isLoading;

  Future<void> loadNotifications() async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _api.getNotifications();
      _notifications = (response as List)
          .map((n) => AppNotification.fromJson(n))
          .toList();
      _unreadCount = await _api.getUnreadCount();
    } catch (e) {
      debugPrint('Notifications error: $e');
    }
    _isLoading = false;
    notifyListeners();
  }
}
