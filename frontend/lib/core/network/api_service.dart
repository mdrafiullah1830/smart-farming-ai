import 'package:dio/dio.dart';

class ApiService {
  late Dio _dio;

  static const String baseUrl = 'http://localhost:8000/api/v1';

  ApiService() {
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));
  }

  // ─── Weather Endpoints ──────────────────────────────────────────────

  Future<Map<String, dynamic>> getDistrictWeather(String districtId) async {
    final response = await _dio.get('/weather/district/$districtId');
    return response.data;
  }

  Future<Map<String, dynamic>> getWeatherForecast(String districtId) async {
    final response = await _dio.get('/weather/district/$districtId/forecast');
    return response.data;
  }

  Future<Map<String, dynamic>> getWeatherRisk(String districtId) async {
    final response = await _dio.get('/weather/district/$districtId/risk');
    return response.data;
  }

  // ─── Soil Endpoints ─────────────────────────────────────────────────

  Future<Map<String, dynamic>> analyzeSoil(Map<String, dynamic> data) async {
    final response = await _dio.post('/soil/analyze', data: data);
    return response.data;
  }

  Future<Map<String, dynamic>> getSoilReports() async {
    final response = await _dio.get('/soil/reports');
    return response.data;
  }

  // ─── Crop Endpoints ─────────────────────────────────────────────────

  Future<Map<String, dynamic>> recommendCrops(Map<String, dynamic> data) async {
    final response = await _dio.post('/crops/recommend', data: data);
    return response.data;
  }

  Future<Map<String, dynamic>> listCrops() async {
    final response = await _dio.get('/crops/');
    return response.data;
  }

  Future<Map<String, dynamic>> getCropDetail(String cropId) async {
    final response = await _dio.get('/crops/$cropId');
    return response.data;
  }

  // ─── Yield Endpoints ────────────────────────────────────────────────

  Future<Map<String, dynamic>> predictYield(Map<String, dynamic> data) async {
    final response = await _dio.post('/yield/predict', data: data);
    return response.data;
  }

  // ─── Disease Endpoints ──────────────────────────────────────────────

  Future<Map<String, dynamic>> detectDisease(String imagePath) async {
    final formData = FormData.fromMap({
      'image': await MultipartFile.fromFile(imagePath),
    });
    final response = await _dio.post('/disease/detect', data: formData);
    return response.data;
  }

  // ─── Market Endpoints ───────────────────────────────────────────────

  Future<Map<String, dynamic>> getMarketPrices(String cropId) async {
    final response = await _dio.get('/market/prices/$cropId');
    return response.data;
  }

  Future<Map<String, dynamic>> getMarketAnalysis(String districtId) async {
    final response = await _dio.get('/market/analysis/$districtId');
    return response.data;
  }

  // ─── Chatbot Endpoints ──────────────────────────────────────────────

  Future<Map<String, dynamic>> chat(String message, String sessionId) async {
    final response = await _dio.post('/chatbot/chat', data: {
      'message': message,
      'session_id': sessionId,
      'language': 'bn',
    });
    return response.data;
  }

  // ─── Farm Endpoints ─────────────────────────────────────────────────

  Future<Map<String, dynamic>> createFarm(Map<String, dynamic> data) async {
    final response = await _dio.post('/farms/', data: data);
    return response.data;
  }

  Future<Map<String, dynamic>> listFarms() async {
    final response = await _dio.get('/farms/');
    return response.data;
  }

  // ─── Notification Endpoints ─────────────────────────────────────────

  Future<Map<String, dynamic>> getNotifications() async {
    final response = await _dio.get('/notifications/');
    return response.data;
  }

  Future<int> getUnreadCount() async {
    final response = await _dio.get('/notifications/unread-count');
    return response.data['unread_count'];
  }

  // ─── Government Endpoints ───────────────────────────────────────────

  Future<Map<String, dynamic>> getGovernmentDashboard() async {
    final response = await _dio.get('/government/dashboard');
    return response.data;
  }

  Future<Map<String, dynamic>> listDistricts() async {
    final response = await _dio.get('/government/districts');
    return response.data;
  }
}
