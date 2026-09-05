---
dataset_info:
  features:
  - name: image
    dtype: image
  - name: label
    dtype:
      class_label:
        names:
          '0': Blight
          '1': Common_Rust
          '2': Gray_Leaf_Spot
          '3': Healthy
  splits:
  - name: train
    num_bytes: 48180050
    num_examples: 4188
  download_size: 171316661
  dataset_size: 48180050
configs:
- config_name: default
  data_files:
  - split: train
    path: data/train-*
---

# Corn Maize Leaf Disease

A dataset for disease classification of corn/maize leaves. The dataset contains 4,188 images across 4 classes: Blight, Common_Rust, Gray_Leaf_Spot, Healthy.  
Images per class:
- Blight: 1,146
- Common_Rust: 1,306
- Gray_Leaf_Spot: 574
- Healthy: 1,162

This dataset is indexed on https://project-agml.github.io/ as part of the AgML python library.

## Citation

Singh D, Jain N, Jain P, Kayal P, Kumawat S, Batra N. PlantDoc: a dataset for visual plant disease detection. InProceedings of the 7th ACM IKDD CoDS and 25th COMAD 2020 Jan 5 (pp. 249-253).