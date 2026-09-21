import 'package:flutter_test/flutter_test.dart';
import 'package:smart_farming_app/providers/providers.dart';

void main() {
  group('WeatherProvider', () {
    test('initial state is correct', () {
      final provider = WeatherProvider();
      expect(provider.currentWeather, isNull);
      expect(provider.forecast, isEmpty);
      expect(provider.isLoading, isFalse);
      expect(provider.errorMessage, isNull);
    });

    test('clearError resets error message', () {
      final provider = WeatherProvider();
      provider.clearError();
      expect(provider.errorMessage, isNull);
    });
  });

  group('DiseaseProvider', () {
    test('initial state is correct', () {
      final provider = DiseaseProvider();
      expect(provider.result, isNull);
      expect(provider.isLoading, isFalse);
      expect(provider.errorMessage, isNull);
    });

    test('clearResult resets result', () {
      final provider = DiseaseProvider();
      provider.clearResult();
      expect(provider.result, isNull);
    });

    test('clearError resets error message', () {
      final provider = DiseaseProvider();
      provider.clearError();
      expect(provider.errorMessage, isNull);
    });
  });

  group('MarketProvider', () {
    test('initial state is correct', () {
      final provider = MarketProvider();
      expect(provider.analysis, isNull);
      expect(provider.isLoading, isFalse);
      expect(provider.errorMessage, isNull);
    });
  });

  group('FarmProvider', () {
    test('initial state is correct', () {
      final provider = FarmProvider();
      expect(provider.farms, isEmpty);
      expect(provider.isLoading, isFalse);
      expect(provider.errorMessage, isNull);
    });
  });

  group('AuthProvider', () {
    test('initial state is correct', () {
      final provider = AuthProvider();
      expect(provider.user, isNull);
      expect(provider.token, isNull);
      expect(provider.isAuthenticated, isFalse);
    });

    test('setUser updates state', () {
      final provider = AuthProvider();
      final user = User(id: '1', email: 'test@test.com');
      provider.setUser(user, token: 'test-token');
      expect(provider.user, isNotNull);
      expect(provider.token, 'test-token');
      expect(provider.isAuthenticated, isTrue);
    });

    test('logout clears state', () {
      final provider = AuthProvider();
      provider.setUser(User(id: '1', email: 'test@test.com'), token: 'token');
      provider.logout();
      expect(provider.user, isNull);
      expect(provider.token, isNull);
      expect(provider.isAuthenticated, isFalse);
    });
  });
}
