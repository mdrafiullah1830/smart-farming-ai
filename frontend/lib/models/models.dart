class Farmer {
  final String id;
  final String phone;
  final String fullName;
  final String fullNameBn;
  final String? email;
  final String? districtId;
  final String? upazila;
  final String? village;
  final String role;
  final bool isVerified;
  final String languagePreference;

  Farmer({
    required this.id,
    required this.phone,
    required this.fullName,
    required this.fullNameBn,
    this.email,
    this.districtId,
    this.upazila,
    this.village,
    this.role = 'farmer',
    this.isVerified = false,
    this.languagePreference = 'bn',
  });

  factory Farmer.fromJson(Map<String, dynamic> json) {
    return Farmer(
      id: json['id'],
      phone: json['phone'],
      fullName: json['full_name'],
      fullNameBn: json['full_name_bn'],
      email: json['email'],
      districtId: json['district_id'],
      upazila: json['upazila'],
      village: json['village'],
      role: json['role'] ?? 'farmer',
      isVerified: json['is_verified'] ?? false,
      languagePreference: json['language_preference'] ?? 'bn',
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'phone': phone,
    'full_name': fullName,
    'full_name_bn': fullNameBn,
    'email': email,
    'district_id': districtId,
    'upazila': upazila,
    'village': village,
    'role': role,
    'is_verified': isVerified,
    'language_preference': languagePreference,
  };
}

class Farm {
  final String id;
  final String name;
  final String? nameBn;
  final String? district;
  final String? upazila;
  final String? village;
  final double latitude;
  final double longitude;
  final double areaAcres;
  final String? soilType;
  final String? irrigationType;
  final String? waterSource;
  final bool isActive;

  Farm({
    required this.id,
    required this.name,
    this.nameBn,
    this.district,
    this.upazila,
    this.village,
    required this.latitude,
    required this.longitude,
    required this.areaAcres,
    this.soilType,
    this.irrigationType,
    this.waterSource,
    this.isActive = true,
  });

  factory Farm.fromJson(Map<String, dynamic> json) {
    return Farm(
      id: json['id'],
      name: json['name'],
      nameBn: json['name_bn'],
      district: json['district'],
      upazila: json['upazila'],
      village: json['village'],
      latitude: (json['latitude'] ?? 0).toDouble(),
      longitude: (json['longitude'] ?? 0).toDouble(),
      areaAcres: (json['area_acres'] ?? 0).toDouble(),
      soilType: json['soil_type'],
      irrigationType: json['irrigation_type'],
      waterSource: json['water_source'],
      isActive: json['is_active'] ?? true,
    );
  }
}

class WeatherData {
  final String district;
  final String districtBn;
  final double temperature;
  final double feelsLike;
  final double humidity;
  final double pressure;
  final double windSpeed;
  final String windDirection;
  final double rainfall;
  final double cloudCover;
  final double visibility;
  final String condition;
  final String conditionBn;
  final String icon;
  final String sunrise;
  final String sunset;
  final String? forecastDate;

  WeatherData({
    required this.district,
    required this.districtBn,
    required this.temperature,
    required this.feelsLike,
    required this.humidity,
    required this.pressure,
    required this.windSpeed,
    required this.windDirection,
    required this.rainfall,
    required this.cloudCover,
    required this.visibility,
    required this.condition,
    required this.conditionBn,
    required this.icon,
    required this.sunrise,
    required this.sunset,
    this.forecastDate,
  });

  factory WeatherData.fromJson(Map<String, dynamic> json) {
    return WeatherData(
      district: json['district'] ?? '',
      districtBn: json['district_bn'] ?? '',
      temperature: (json['temperature_c'] ?? 0).toDouble(),
      feelsLike: (json['feels_like_c'] ?? 0).toDouble(),
      humidity: (json['humidity'] ?? 0).toDouble(),
      pressure: (json['pressure'] ?? 0).toDouble(),
      windSpeed: (json['wind_speed'] ?? 0).toDouble(),
      windDirection: json['wind_direction'] ?? '',
      rainfall: (json['rainfall_mm'] ?? 0).toDouble(),
      cloudCover: (json['cloud_cover'] ?? 0).toDouble(),
      visibility: (json['visibility'] ?? 0).toDouble(),
      condition: json['condition'] ?? '',
      conditionBn: json['condition_bn'] ?? '',
      icon: json['icon'] ?? '',
      sunrise: json['sunrise'] ?? '',
      sunset: json['sunset'] ?? '',
      forecastDate: json['forecast_date'],
    );
  }
}

class CropRecommendation {
  final String id;
  final String name;
  final String nameBn;
  final String category;
  final double confidence;
  final double waterRequirement;
  final double profitScore;
  final String season;
  final int growthDays;
  final double expectedYield;
  final double avgPrice;

  CropRecommendation({
    required this.id,
    required this.name,
    required this.nameBn,
    required this.category,
    required this.confidence,
    required this.waterRequirement,
    required this.profitScore,
    required this.season,
    required this.growthDays,
    required this.expectedYield,
    required this.avgPrice,
  });

  factory CropRecommendation.fromJson(Map<String, dynamic> json) {
    return CropRecommendation(
      id: json['id'],
      name: json['name'],
      nameBn: json['name_bn'],
      category: json['category'],
      confidence: (json['confidence'] ?? 0).toDouble(),
      waterRequirement: (json['water_requirement_mm'] ?? 0).toDouble(),
      profitScore: (json['profit_score'] ?? 0).toDouble(),
      season: json['growing_season'] ?? '',
      growthDays: json['growth_duration_days'] ?? 0,
      expectedYield: (json['expected_yield_per_acre'] ?? 0).toDouble(),
      avgPrice: (json['avg_price_per_kg'] ?? 0).toDouble(),
    );
  }
}

class DiseaseDetectionResult {
  final String diseaseName;
  final String diseaseNameBn;
  final double confidence;
  final String severity;
  final String description;
  final String descriptionBn;
  final List<Map<String, dynamic>> treatment;
  final List<String> prevention;
  final List<String> preventionBn;

  DiseaseDetectionResult({
    required this.diseaseName,
    required this.diseaseNameBn,
    required this.confidence,
    required this.severity,
    required this.description,
    required this.descriptionBn,
    required this.treatment,
    required this.prevention,
    required this.preventionBn,
  });

  factory DiseaseDetectionResult.fromJson(Map<String, dynamic> json) {
    return DiseaseDetectionResult(
      diseaseName: json['disease_name'],
      diseaseNameBn: json['disease_name_bn'],
      confidence: (json['confidence'] ?? 0).toDouble(),
      severity: json['severity'] ?? 'low',
      description: json['description'] ?? '',
      descriptionBn: json['description_bn'] ?? '',
      treatment: List<Map<String, dynamic>>.from(json['treatment'] ?? []),
      prevention: List<String>.from(json['prevention'] ?? []),
      preventionBn: List<String>.from(json['prevention_bn'] ?? []),
    );
  }
}

class ChatMessage {
  final String role;
  final String content;
  final String? intent;
  final DateTime timestamp;

  ChatMessage({
    required this.role,
    required this.content,
    this.intent,
    required this.timestamp,
  });
}

class AppNotification {
  final String id;
  final String title;
  final String titleBn;
  final String message;
  final String messageBn;
  final String type;
  final String severity;
  final bool isRead;
  final DateTime createdAt;

  AppNotification({
    required this.id,
    required this.title,
    required this.titleBn,
    required this.message,
    required this.messageBn,
    required this.type,
    required this.severity,
    required this.isRead,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'],
      title: json['title'],
      titleBn: json['title_bn'],
      message: json['message'],
      messageBn: json['message_bn'],
      type: json['type'],
      severity: json['severity'],
      isRead: json['is_read'],
      createdAt: DateTime.parse(json['created_at']),
    );
  }
}

class SoilAnalysisResult {
  final double healthScore;
  final String healthLabel;
  final String healthLabelBn;
  final List<Map<String, dynamic>> suitableCrops;
  final List<Map<String, dynamic>> fertilizerRecommendations;
  final List<Map<String, dynamic>> riskIndicators;
  final List<String> improvementTips;
  final List<String> improvementTipsBn;

  SoilAnalysisResult({
    required this.healthScore,
    required this.healthLabel,
    required this.healthLabelBn,
    required this.suitableCrops,
    required this.fertilizerRecommendations,
    required this.riskIndicators,
    required this.improvementTips,
    required this.improvementTipsBn,
  });

  factory SoilAnalysisResult.fromJson(Map<String, dynamic> json) {
    return SoilAnalysisResult(
      healthScore: (json['health_score'] ?? 0).toDouble(),
      healthLabel: json['health_label'] ?? '',
      healthLabelBn: json['health_label_bn'] ?? '',
      suitableCrops: List<Map<String, dynamic>>.from(json['suitable_crops'] ?? []),
      fertilizerRecommendations: List<Map<String, dynamic>>.from(json['fertilizer_recommendations'] ?? []),
      riskIndicators: List<Map<String, dynamic>>.from(json['risk_indicators'] ?? []),
      improvementTips: List<String>.from(json['improvement_tips'] ?? []),
      improvementTipsBn: List<String>.from(json['improvement_tips_bn'] ?? []),
    );
  }
}

class District {
  final String id;
  final String name;
  final String nameBn;
  final String division;
  final double latitude;
  final double longitude;

  District({
    required this.id,
    required this.name,
    required this.nameBn,
    required this.division,
    required this.latitude,
    required this.longitude,
  });

  factory District.fromJson(Map<String, dynamic> json) {
    return District(
      id: json['id'],
      name: json['name'],
      nameBn: json['name_bn'],
      division: json['division'],
      latitude: (json['latitude'] ?? 0).toDouble(),
      longitude: (json['longitude'] ?? 0).toDouble(),
    );
  }
}
