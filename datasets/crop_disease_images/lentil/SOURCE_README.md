---
configs:
- config_name: default
  data_files:
  - split: train
    path: data/train-*
license: cc-by-4.0
task_categories:
- image-classification
size_categories:
- 1K<n<10K
dataset_info:
  features:
  - name: image
    dtype: image
  - name: label
    dtype:
      class_label:
        names:
          '0': Ascochyta blight
          '1': Lentil Rust
          '2': Normal
          '3': Powdery Mildew
  splits:
  - name: train
    num_bytes: 72069344
    num_examples: 5349
  download_size: 73836213
  dataset_size: 72069344
---

# Lentil Disease Classification

A dataset for disease classification of lentil leaves. The dataset contains 5,349 images across 4 classes: Ascochyta blight, Lentil Rust, Normal, Powdery Mildew.  
Images per class:
- Ascochyta blight: 1,229
- Lentil Rust: 1,248
- Normal: 1,569
- Powdery Mildew: 1,303

This dataset is indexed on https://project-agml.github.io/ as part of the AgML python library.

## Citation

```bibtex
@article{mahamud2025lentil,
  title={Lentil plant disease and quality assessment: A detailed dataset of high-resolution images for deep learning research},
  author={Mahamud, Eram and Assaduzzaman, Md and Sharmin, Shayla},
  journal={Data in Brief},
  volume={58},
  pages={111224},
  year={2025},
  publisher={Elsevier}
}
```

Mahamud, Eram ; Tapos, Md Assaduzzaman (2024), “Lentil Plant Disease Image Dataset (4 Class)”, Mendeley Data, V2, doi: 10.17632/7vb77bz2st.2