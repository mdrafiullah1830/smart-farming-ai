---
dataset_info:
  features:
  - name: image
    dtype: image
  - name: label
    dtype:
      class_label:
        names:
          '0': Bacterial_blight
          '1': Frogeye
          '2': Healthy
          '3': Soyabean_rust
  splits:
  - name: train
    num_bytes: 11613197
    num_examples: 1260
  - name: validation
    num_bytes: 2504915
    num_examples: 268
  - name: test
    num_bytes: 2660714
    num_examples: 272
  download_size: 16868299
  dataset_size: 16778826
configs:
- config_name: default
  data_files:
  - split: train
    path: data/train-*
  - split: validation
    path: data/validation-*
  - split: test
    path: data/test-*
---
