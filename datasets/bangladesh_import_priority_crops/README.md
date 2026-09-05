# Bangladesh import-priority crops dataset

বাংলাদেশ সময় অনুযায়ী ২৮ আগস্ট ২০২৬ তারিখে সংগ্রহ করা public data package। তুলনাযোগ্য সর্বশেষ পূর্ণ FAOSTAT তিন বছর হলো ২০২২–২০২৪। BBS-এর ২০২২–২০২৫ yearbook-ও `docs/`-এ রাখা হয়েছে।

## গবেষণার ফল

২০২২–২০২৪ FAOSTAT data-তে আমদানি উল্লেখযোগ্য এবং দেশীয় উৎপাদন অন্তত ৫% বেড়েছে—এমন পাঁচটি শক্ত match পাওয়া গেছে:

- গম: উৎপাদন +7.96%; ২০২৪ import 2.90 million tonnes
- ভুট্টা: উৎপাদন +7.76%; ২০২৪ import 1.18 million tonnes
- পেঁয়াজ: উৎপাদন +15.90%; ২০২৪ import 0.44 million tonnes
- সরিষা/রেপসিড: উৎপাদন +55.68%; ২০২৪ seed import 0.32 million tonnes
- সয়াবিন: উৎপাদন +8.30%; ২০২৪ import 2.03 million tonnes

আরও তিনটি গুরুত্বপূর্ণ import-dependent candidate রাখা হয়েছে, তবে “উৎপাদন সবচেয়ে বেশি বাড়ছে” দাবি করা যাবে না:

- রসুন: উৎপাদন +0.16%; trend প্রায় flat
- আদা: উৎপাদন +1.25%; trend প্রায় flat
- মসুর: উৎপাদন -3.11%; সাম্প্রতিক trend নেতিবাচক

অতএব আটটি crop-এর dataset দেওয়া হলেও strict দুই-শর্তে পাঁচটি crop নিশ্চিতভাবে উত্তীর্ণ। এই পার্থক্য `processed/crop_priority_summary_2022_2024.csv`-এর `assessment` column-এ আছে।

## ফাইলসমূহ

- `raw/`: FAOSTAT-এর original compressed production ও trade archives এবং dataset manifest
- `processed/bangladesh_selected_crops_production_2022_latest.csv`: area, yield ও production
- `processed/bangladesh_selected_crops_imports_2022_latest.csv`: import quantity ও value
- `processed/crop_priority_summary_2022_2024.csv`: crop-level comparison ও classification
- `docs/`: BBS yearbooks, Bangladesh Bank, USDA ও CPD supporting reports
- `dataset_manifest.json`: coverage এবং raw archive SHA-256 checksums
- `sources.csv`: source URL, publisher, coverage ও local filename
- `build_dataset.py` ও `summarize_dataset.py`: reproducible extract/summary scripts

## গুরুত্বপূর্ণ সীমাবদ্ধতা

- FAOSTAT-এর Bangladesh trade rows-এ `X` flag আছে: এগুলো trading-partner data দিয়ে estimated। BBS, NBR/Bangladesh Bank ও USDA reports দিয়ে cross-check করা উচিত।
- FAOSTAT calendar year এবং Bangladesh fiscal year এক নয়; একই chart/model-এ মেশানোর আগে period label রাখতে হবে।
- সরিষা/রেপসিড summary-তে `Mustard seed` ও `Rape or colza seed` import যোগ করা হয়েছে; production series হলো `Rape or colza seed`।
- “Import বেশি হওয়ার কারণে উৎপাদন বেড়েছে” causal claim এই observational data একা প্রমাণ করে না। এখানে import dependence ও production growth পাশাপাশি দেখা হয়েছে।

## পুনরায় তৈরি

Project root থেকে:

```bash
python3 datasets/bangladesh_import_priority_crops/build_dataset.py
python3 datasets/bangladesh_import_priority_crops/summarize_dataset.py
```
