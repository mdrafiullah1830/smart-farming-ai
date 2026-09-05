---
configs:
- config_name: augmented
  data_files:
  - split: train
    path: augmented/train-*
- config_name: raw
  default: true
  data_files:
  - split: train
    path: raw/train-*
license: cc-by-4.0
task_categories:
- image-classification
size_categories:
- 1K<n<10K
dataset_info:
- config_name: augmented
  features:
  - name: image
    dtype: image
  - name: label
    dtype:
      class_label:
        names:
          '0': Iris yellow virus
          '1': Stemphylium leaf blight and collectrichum leaf blight
          '2': healthy
          '3': purple blotch
  splits:
  - name: train
    num_bytes: 35805744
    num_examples: 4502
  download_size: 35675035
  dataset_size: 35805744
- config_name: raw
  features:
  - name: image
    dtype: image
  - name: label
    dtype:
      class_label:
        names:
          '0': Iris yellow virus
          '1': Stemphylium leaf blight and collectrichum leaf blight
          '2': healthy
          '3': purple blotch
  splits:
  - name: train
    num_bytes: 16357262
    num_examples: 815
  download_size: 16364888
  dataset_size: 16357262
---

# COLD Onion Leaf Disease Classification

A dataset for disease classification of onion leaves. The dataset contains raw and augmented versions.  
The raw dataset contains 815 images.  
Images per class:
- Iris yellow virus: 281
- Stemphylium leaf blight and collectrichum leaf blight: 90
- healthy: 426
- purple blotch: 18

The augmented dataset contains 4,502 images.  
Images per class:
- Iris yellow virus: 1,272
- Stemphylium leaf blight and collectrichum leaf blight: 1,217
- healthy: 1,278
- purple blotch: 735


This dataset is indexed on https://project-agml.github.io/ as part of the AgML python library.

## Citation

```bibtex
@article{aishwarya2024dataset,
  title={Dataset of chilli and onion plant leaf images for classification and detection},
  author={Aishwarya, MP and Reddy, A Padmanabha},
  journal={Data in Brief},
  volume={54},
  pages={110524},
  year={2024},
  publisher={Elsevier}
}
```

M P, Aishwarya; Reddy, Padmanabha  (2024), “Onion dataset”, Mendeley Data, V2, doi: 10.17632/7nxxn4gj5s.2