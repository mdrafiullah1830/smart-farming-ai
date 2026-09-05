# Crop disease image datasets

Local collection for eight target crops: wheat, maize, onion, garlic, ginger,
lentil, mustard and soybean. Dataset binaries are intentionally ignored by Git;
only the documentation, reproducibility scripts and validation metadata should
be committed.

## Inventory

| Crop | Local data | Images | License stated by source | Labels |
|---|---|---:|---|---|
| Wheat | `wheat/wheat_leaf_rust_cc-by-4.0.zip` | 859 | CC BY 4.0 | diseased, control |
| Maize | `maize/corn_maize_leaf_disease.parquet` | 4,188 | Not specified | Blight, Common_Rust, Gray_Leaf_Spot, Healthy |
| Onion | `onion/onion_leaf_disease_raw_cc-by-4.0.parquet` | 815 | CC BY 4.0 | Iris yellow virus, mixed Stemphylium/collectrichum leaf blight, healthy, purple blotch |
| Garlic | `garlic/images/` | 36 (18/class) | CC BY 4.0 | affected, healthy |
| Ginger | `ginger/ginger_leaf_dataset.zip` | 10,910 | Not specified | Damage-Pest, Dehydrated, Healthy, Leaf-blight |
| Lentil | `lentil/lentil_disease_cc-by-4.0.parquet` | 5,349 | CC BY 4.0 | Ascochyta blight, Lentil Rust, Normal, Powdery Mildew |
| Mustard | `mustard/images/` | 400 (100/class) | CC BY 4.0 | healthy, mild, moderate, severe |
| Soybean | `soybean/*.parquet` | 1,800 | Not specified | Bacterial_blight, Frogeye, Healthy, Soyabean_rust |

Detailed provenance is in `sources.csv`. The Hugging Face source cards are
preserved as `SOURCE_README.md` beside the relevant datasets. “Not specified”
means the public repository/source card did not declare a license; it does not
mean unrestricted use. Confirm permission before commercial redistribution.

## Important scope limits

- Mustard labels measure flea-beetle damage severity. This is valid plant-health
  imagery but is not a pathogen-disease classification dataset.
- Garlic covers Tipburn/affected versus healthy only and is a balanced subset,
  not a complete garlic disease taxonomy.
- Ginger includes dehydration and pest damage alongside leaf blight, so those
  labels must not be presented as diseases without qualification.
- The maize and soybean source cards and ginger repository do not state a
  license. Keep them local/research-only until permission is verified.

## Reproduction and validation

The large garlic and mustard Mendeley ZIPs are sampled remotely without saving
the multi-gigabyte archives. `download_remote_zip_subset.py` reads the central
directory by HTTP byte ranges, selects files in stable archive order, writes via
temporary `.part` files and skips already downloaded non-empty files.

Run integrity validation after any download:

```bash
python3 datasets/crop_disease_images/validate_datasets.py
```

The command verifies ZIP CRCs, Parquet magic bytes, decodes folder images with
Pillow, reports empty/corrupt/partial files, computes SHA-256 values and writes
`validation_report.json`.
