# FlyWire brain data

This folder contains the download script for the **FlyWire FAFB v783 whole adult fruit-fly brain neuron skeleton dataset**.

## Download the actual dataset

From the repository root, run:

```bash
bash flybrain/download-flywire-skeletons.sh
```

This downloads:

`flybrain/sk_lod1_783_healed_ds2.parquet`

- Size: approximately 5.4 GB
- Contents: downsampled, healed 3D skeletons for FlyWire v783 neurons, stored in Parquet with SWC-style skeleton data
- Dataset version: FlyWire v783 (October 2023 snapshot)
- Source: [Zenodo record 10877326](https://zenodo.org/records/10877326)
- File checksum (MD5): `a4c104776f33ec539ef859064c4de3df`

The dataset itself is hosted by Zenodo rather than committed to this GitHub repository because GitHub's normal Git file limit is 100 MB. The script downloads the original file and verifies its checksum.

## Using it

The Parquet file can be inspected with Python and PyArrow:

```bash
python -m pip install pyarrow pandas
```

The dataset is a structural reconstruction of neuron morphology, not a recording of brain activity or consciousness. Cite the original FlyWire / Schlegel et al. dataset when using it in the project. Check the dataset's current licence and attribution terms before redistributing or using it beyond this project.

Original dataset: [https://doi.org/10.5281/zenodo.10877326](https://doi.org/10.5281/zenodo.10877326)
