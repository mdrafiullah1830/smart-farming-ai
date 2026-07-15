import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/theme/app_theme.dart';

class ChatbotScreen extends StatefulWidget {
  const ChatbotScreen({super.key});

  @override
  State<ChatbotScreen> createState() => _ChatbotScreenState();
}

class _ChatbotScreenState extends State<ChatbotScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final List<Map<String, dynamic>> _messages = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _messages.add({
      'role': 'assistant',
      'content': 'আমি আপনার AI কৃষি সহায়ক। ধান, গম, পাট, রোগ, সেচ, বাজার বা যেকোনো কৃষি বিষয়ে জিজ্ঞাসা করুন।',
      'timestamp': DateTime.now(),
    });
  }

  Future<void> _sendMessage() async {
    if (_controller.text.isEmpty) return;
    final message = _controller.text;
    _controller.clear();

    setState(() {
      _messages.add({'role': 'user', 'content': message, 'timestamp': DateTime.now()});
      _isLoading = true;
    });

    await Future.delayed(const Duration(seconds: 1));

    final response = _generateResponse(message);
    setState(() {
      _messages.add({'role': 'assistant', 'content': response, 'timestamp': DateTime.now()});
      _isLoading = false;
    });

    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(_scrollController.position.maxScrollExtent, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      }
    });
  }

  String _generateResponse(String query) {
    final q = query.toLowerCase();
    if (q.contains('ধান') || q.contains('rice')) {
      return 'ধান বাংলাদেশের প্রধান খাদ্যশস্য। প্রধান জাত: বোরো, আমন, বৈশাখী। ধানের জন্য উষ্ণ ও আর্দ্র জলবায়ু প্রয়োজন। সময়মতো বীজ বুনুন এবং সুষম সার প্রয়োগ করুন।';
    } else if (q.contains('গম') || q.contains('wheat')) {
      return 'গম রবি মৌসুমের গুরুত্বপূর্ণ ফসল। নভেম্বর-ডিসেম্বরে বীজ বুনা হয়। মার্চ-এপ্রিলে ফসল তোলা হয়। সেচ ব্যবস্থা রাখুন এবং রোগ প্রতিরোধী জাত ব্যবহার করুন।';
    } else if (q.contains('পাট') || q.contains('jute')) {
      return 'পাট বাংলাদেশের ঐতিহ্যবাহী অর্থকরী ফসল। খরিফ মৌসুমে চাষ করা হয়। জলাবদ্ধ এলাকায় ভালো ফলন হয়। রপ্তানি আয়ের গুরুত্বপূর্ণ উৎস।';
    } else if (q.contains('রোগ') || q.contains('disease')) {
      return 'ফসলের রোগ প্রতিরোধে: ১) নিয়মিত মাঠ পরিদর্শন করুন। ২) প্রতিরোধী জাত ব্যবহার করুন। ৩) সুষম সার প্রয়োগ করুন। ৪) প্রয়োজনে ছত্রাকনাশক ব্যবহার করুন।';
    } else if (q.contains('সেচ') || q.contains('irrigation')) {
      return 'সঠিক সেচ ব্যবস্থাপনা: ১) ড্রিপ সেচ ব্যবহার করুন। ২) সকালে বা সন্ধ্যায় সেচ দিন। ৩) মাটির আর্দ্রতা পরীক্ষা করুন। ৪) বৃষ্টির পানি সংরক্ষণ করুন।';
    } else if (q.contains('বাজার') || q.contains('market') || q.contains('দাম')) {
      return 'ফসলের সেরা দাম পেতে: ১) সরাসরি বাজারে বিক্রি করুন। ২) সমবায় সমিতির সাথে যোগাযোগ করুন। ৩) সঠিক সময়ে বিক্রি করুন। ৪) মূল্য সংরক্ষণ করুন।';
    } else if (q.contains('সার') || q.contains('fertilizer')) {
      return 'মাটি পরীক্ষার ভিত্তিতে সার প্রয়োগ করুন। অতিরিক্ত সার মাটি ও পরিবেশের ক্ষতি করে। জৈব সার ব্যবহার উত্সাহিত। প্রতি বছর মাটি পরীক্ষা করুন।';
    } else if (q.contains('লাভ') || q.contains('profit') || q.contains('উপার্জন')) {
      return 'কৃষিতে লাভ বাড়াতে: ১) উচ্চ মূল্যের ফসল চাষ করুন। ২) পর্যায়ক্রমে ফসল চাষ করুন। ৩) খরচ কমান। ৪) সরাসরি বাজারে বিক্রি করুন।';
    }
    return 'আমি কৃষি সম্পর্কে আপনাকে সাহায্য করতে পারি। অনুগ্রহ করে ধান, গম, পাট, রোগ, সেচ, বাজার, সার বা কীটপতঙ্গ সম্পর্কে জিজ্ঞাসা করুন।';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            CircleAvatar(backgroundColor: Colors.white24, child: const Icon(Icons.smart_toy, color: Colors.white, size: 20)),
            const SizedBox(width: 8),
            Text('AI কৃষি সহায়ক', style: GoogleFonts.notoSansBengali()),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length + (_isLoading ? 1 : 0),
              itemBuilder: (context, index) {
                if (index == _messages.length) {
                  return const Align(
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: EdgeInsets.all(8),
                      child: CircularProgressIndicator(),
                    ),
                  );
                }
                final msg = _messages[index];
                final isUser = msg['role'] == 'user';
                return Align(
                  alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: isUser ? AppTheme.primaryColor : Colors.grey[200],
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      msg['content'],
                      style: GoogleFonts.notoSansBengali(
                        color: isUser ? Colors.white : Colors.black87,
                        fontSize: 14,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: Colors.white, boxShadow: [BoxShadow(color: Colors.grey.withOpacity(0.2), blurRadius: 4)]),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    decoration: InputDecoration(
                      hintText: 'আপনার প্রশ্ন লিখুন...',
                      hintStyle: GoogleFonts.notoSansBengali(),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                CircleAvatar(
                  backgroundColor: AppTheme.primaryColor,
                  child: IconButton(
                    icon: const Icon(Icons.send, color: Colors.white),
                    onPressed: _sendMessage,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }
}
