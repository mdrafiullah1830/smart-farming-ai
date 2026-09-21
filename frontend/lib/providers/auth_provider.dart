import 'package:flutter/material.dart';

class User {
  final String? id;
  final String? fullNameBn;
  final String? fullNameEn;
  final String? email;

  User({this.id, this.fullNameBn, this.fullNameEn, this.email});
}

class AuthProvider extends ChangeNotifier {
  User? _user;
  String? _token;

  User? get user => _user;
  String? get token => _token;
  bool get isAuthenticated => _token != null;

  void setUser(User? user, {String? token}) {
    _user = user;
    _token = token ?? _token;
    notifyListeners();
  }

  void logout() {
    _user = null;
    _token = null;
    notifyListeners();
  }
}
