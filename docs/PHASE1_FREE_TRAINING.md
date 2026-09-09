# Phase 1 — Free journal-grade training

1. Upload crop archives to `MyDrive/Smart_Farming_AI/datasets/raw/`.
2. Open `notebooks/phase1_free_gpu_colab.ipynb` in Colab and select a GPU runtime.
3. Train one crop at a time: rice, potato, tomato, maize, wheat.
4. Keep external Bangladesh field images only in `datasets/field_test`; never use them for model selection.
5. Publish macro-F1, per-class recall, confusion matrix, calibration and field-test results—not accuracy alone.

Expected image layout after extraction:

```text
dataset/
  crop_name/
    disease_name/
      image.jpg
```

The audit script removes exact duplicates before a deterministic 70/15/15 split. Near-duplicate and source/farm grouped splitting must be added before journal submission.
