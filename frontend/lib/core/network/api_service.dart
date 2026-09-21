import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

class ApiService {
  late Dio _dio;

  static String get baseUrl {
    if (kDebugMode) {
      return 'http://localhost:8000/api/v1';
    }
    return 'https://api.smartfarmingbd.com/api/v1';
  }

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

  void setAuthToken(String token) {
    _dio.options.headers['Authorization'] = 'Bearer $token';
  }

  // ─── Weather Endpoints ──────────────────────────────────────────────

  Future<Map<String, dynamic>> getDistrictWeather(String districtId) async {
    final response = await _dio.get('/weather/$districtId');
    return response.data;
  }

  // ─── Soil Endpoints ─────────────────────────────────────────────────

  Future<Map<String, dynamic>> getSoilCategories() async {
    final response = await _dio.get('/soil/categories');
    return response.data;
  }

  Future<Map<String, dynamic>> getSoilData(String category, {int limit = 100}) async {
    final response = await _dio.get('/soil/data/$category', queryParameters: {'limit': limit});
    return response.data;
  }

  // ─── Crop Endpoints ─────────────────────────────────────────────────

  Future<Map<String, dynamic>> recommendCrops(Map<String, dynamic> data) async {
    final response = await _dio.post('/crops/recommend', data: data);
    return response.data;
  }

  // ─── Disease Endpoints ──────────────────────────────────────────────

  Future<Map<String, dynamic>> detectDisease(String imagePath, {String? description}) async {
    final formData = FormData.fromMap({
      'image': await MultipartFile.fromFile(imagePath),
      'disease_name': '',
      'confidence': 0.0,
      'description': description ?? '',
      'treatments': [],
    });
    final response = await _dio.post('/disease/detect', data: formData);
    return response.data;
  }

  // ─── Market Endpoints ───────────────────────────────────────────────

  Future<Map<String, dynamic>> getMarketPrices() async {
    final response = await _dio.get('/market/prices');
    return response.data;
  }

  Future<Map<String, dynamic>> getMarketPrice(String crop) async {
    final response = await _dio.get('/market/price/$crop');
    return response.data;
  }

  // ─── Chatbot Endpoints ──────────────────────────────────────────────

  Future<Map<String, dynamic>> chat(String message, {String lang = 'bn'}) async {
    final response = await _dio.post('/chatbot/chat', data: {
      'message': message,
      'lang': lang,
    });
    return response.data;
  }

  // ─── District Endpoints ─────────────────────────────────────────────

  Future<Map<String, dynamic>> listDistricts() async {
    final response = await _dio.get('/districts');
    return response.data;
  }

  Future<Map<String, dynamic>> getDistrict(String name) async {
    final response = await _dio.get('/districts/$name');
    return response.data;
  }

  // ─── Notification Endpoints ─────────────────────────────────────────

  Future<Map<String, dynamic>> getNotifications() async {
    final response = await _dio.get('/notifications');
    return response.data;
  }

  // ─── Stats ──────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getStats() async {
    final response = await _dio.get('/stats');
    return response.data;
  }

  // ─── Health ─────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> healthCheck() async {
    final response = await _dio.get('/health');
    return response.data;
  }
}
