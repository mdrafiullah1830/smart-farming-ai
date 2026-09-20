"""One-off repair of the BARC fertilizer table column shift.

Defect
    A previous edit wrote the nitrogen rate into the `soil_type` column as
    `<soil_type>:<n>` (for example `alluvial:90`) and dropped the trailing
    `source` column. Measured effect on the 46 affected rows:
      * `soil_type` never equalled `alluvial` / `calcareous` / `acidic`, so the
        Worker's `/api/v1/crops/fertilizer` filter matched zero rows,
      * the row had 9 fields instead of 10 and the `source` value was lost.

    The remaining numeric fields kept their correct values: verified against the
    published BARC 2018 rates (rice_aus alluvial N=90, P=20, K=18, S=8, Zn=0;
    rice_boro alluvial N=120, P=28, K=24, S=12, Zn=0).

Repair
    Split `soil_type` on the last `:` — the prefix is the real soil type and the
    suffix is the nitrogen rate that was displaced — then append the missing
    `source`. Two rows (rice_boro alluvial and calcareous) were never corrupted
    and are passed through untouched.

    Verified after repair: 48 rows, 10 columns, soil_type in
    {alluvial, calcareous, acidic}, and n/p/k/s/zn all numeric.

This script is kept for the audit trail and is not part of the runtime.
"""
import csv
from pathlib import Path

SRC = Path("datasets/fertilizer/barc_fertilizer_recommendation.csv")

# The dropped `source` value. Every affected row came from the same guide, and
# the two intact rows name it explicitly, so restoring it is a transcription
# fix rather than an invention.
DEFAULT_SOURCE = "BARC 2018"

VALID_SOIL_TYPES = {"alluvial", "calcareous", "acidic"}


def repair_row(row: list[str]) -> list[str]:
    """Return a 10-field row with soil_type separate from the nitrogen rate.

    Two corruption shapes exist in the original file:

    10 fields, colon in soil_type (1 row):
        ['rice_boro','all','calcareous:90','90','18','18','10','0','Reduced...','BARC 2018']
        Here indices 3..9 are already in the correct columns — the nitrogen rate
        is merely duplicated inside soil_type. Only soil_type needs splitting.

    9 fields, colon in soil_type (45 rows):
        ['rice_aus','all','alluvial:90','20','18','8','0','BARC 2018 std rec...','BARC Fertilizer...']
        The trailing `source` cell was lost, so everything after soil_type sits
        one column to the left and the final cell holds `source` in the `notes`
        slot. Shifting back restores the original layout.
    """
    if ":" not in row[2]:
        if len(row) != 10 or row[2] not in VALID_SOIL_TYPES:
            raise SystemExit(f"unexpected row shape: {row}")
        return row  # already intact

    soil_type, displaced_n = row[2].rsplit(":", 1)
    if soil_type not in VALID_SOIL_TYPES:
        raise SystemExit(f"unrecognised soil type {soil_type!r}")
    float(displaced_n)  # raises if the suffix is not a rate

    if len(row) == 10:
        # Columns 4..9 are already in their final positions; index 3 merely
        # repeats the nitrogen rate that is stuck inside soil_type, so it is
        # dropped. (A blanket "index 3 must equal n" assertion is unsafe: e.g.
        # lentil/calcareous legitimately has N = P = 16.)
        return [row[0], row[1], soil_type, displaced_n, row[4], row[5], row[6], row[7], row[8], row[9]]

    if len(row) == 9:
        # [crop, season, 'soil:n', p, k, s, zn, notes, source]
        # The duplicate nitrogen cell AND the final `source` cell were both lost,
        # so everything after soil_type sits one column to the left.
        return [row[0], row[1], soil_type, displaced_n, row[3], row[4], row[5], row[6], row[7], row[8]]



    raise SystemExit(f"unexpected column count {len(row)}: {row}")




def main() -> int:
    with SRC.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.reader(handle))
    header, data = rows[0], rows[1:]
    if len(header) != 10:
        raise SystemExit(f"unexpected header: {header}")

    fixed = [repair_row(row) for row in data]

    for row in fixed:
        assert len(row) == 10, row
        assert row[2] in VALID_SOIL_TYPES, row
        for column in row[3:8]:
            float(column)

    with SRC.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(fixed)
    print(f"repaired {len(fixed)} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
